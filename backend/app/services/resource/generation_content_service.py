from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.core.tracing import get_trace_id
from app.models import Course, CourseConcept, ResourceGenerationTask
from app.services.model_gateway.chat_client import ChatProviderError
from app.services.model_gateway.errors import ModelGatewayBudgetLimitError
from app.services.model_gateway.router import ModelGateway
from app.services.resource.mindmap_contract import (
    MindmapContractError,
    parse_mindmap_mermaid_payload,
    render_mindmap_payload,
)
from app.services.resource.prompts import (
    build_mindmap_generation_messages,
    build_generation_messages,
    local_resource_template,
    sanitize_generated_resource_content,
)
from app.services.resource.quiz_contract import (
    QuizContractError,
    build_fallback_quiz_payload,
    build_quiz_generation_messages,
    build_quiz_repair_message,
    load_quiz_json_object,
    normalize_quiz_payload_with_fallbacks,
    parse_quiz_json_payload,
    render_quiz_markdown,
)


logger = logging.getLogger(__name__)


class DraftUpdater(Protocol):
    """资源生成草稿更新回调，用于隔离仓储和内容生成服务。"""

    def __call__(self, task: ResourceGenerationTask, content: str, progress: int | None = None) -> None:
        """更新任务草稿内容和可选进度。"""


class ResourceGenerationContentService:
    """封装资源正文生成、流式草稿更新和模型不可用兜底策略。"""

    def __init__(
        self,
        db: Session,
        *,
        update_task_draft: DraftUpdater,
        sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep,
    ) -> None:
        """初始化资源正文生成服务。

        参数:
            db: 当前请求范围内的数据库会话。
            update_task_draft: 任务草稿更新回调。
            sleep: 草稿分片推送的等待函数，测试可注入空等待以避免耗时。
        """

        self.db = db
        self._update_task_draft = update_task_draft
        self._sleep = sleep

    async def generate_resource_content(
        self,
        course: Course | None,
        concept: CourseConcept | None,
        task: ResourceGenerationTask,
        citations: list[dict[str, Any]],
        *,
        profile_summary: str | None = None,
        mastery_context: str | None = None,
        recent_dialog: str | None = None,
    ) -> str:
        """调用模型网关生成资源正文，失败时交由本地模板策略处理。

        参数:
            course: 可选课程实体；为空表示通用资源。
            concept: 可选课程知识点实体。
            task: 当前资源生成任务。
            citations: 课程检索命中的引用依据。
            profile_summary: 学习画像摘要。
            mastery_context: 掌握度薄弱点摘要。
            recent_dialog: 近期对话摘要。

        返回:
            已清洗的 Markdown 正文；模型不可用时由本地模板策略决定返回或抛出错误。
        """

        course_title = course.title if course else "通用学习"
        course_slug = course.slug if course else None
        concept_title = concept.title if concept else (course_title if course else (task.goal or "通用学习主题"))
        if task.resource_type == "quiz":
            return await self._generate_quiz_content(
                task=task,
                course_title=course_title,
                course_slug=course_slug,
                concept_title=concept_title,
                citations=citations,
                profile_summary=profile_summary,
                mastery_context=mastery_context,
                recent_dialog=recent_dialog,
            )
        if task.resource_type == "mindmap":
            return await self._generate_mindmap_content(
                task=task,
                course_title=course_title,
                course_slug=course_slug,
                concept_title=concept_title,
                citations=citations,
                profile_summary=profile_summary,
                mastery_context=mastery_context,
                recent_dialog=recent_dialog,
            )
        messages = build_generation_messages(
            course_title=course_title,
            concept_title=concept_title,
            resource_type=task.resource_type,
            difficulty=task.difficulty,
            goal=task.goal,
            requirements=task.requirements,
            profile_summary=profile_summary,
            citations=citations,
            recent_dialog=recent_dialog,
            mastery_context=mastery_context,
        )
        stream_content = await self._try_stream_chat(task, course_slug, messages)
        if stream_content is not None:
            return stream_content

        blocking_content = await self._try_complete_chat(task, course_slug, messages)
        if blocking_content is not None:
            return blocking_content

        fallback = self.local_resource_template(course, concept, task, profile_summary)
        await self.publish_draft_chunks(task, fallback)
        return fallback

    async def _generate_mindmap_content(
        self,
        *,
        task: ResourceGenerationTask,
        course_title: str,
        course_slug: str | None,
        concept_title: str,
        citations: list[dict[str, Any]],
        profile_summary: str | None,
        mastery_context: str | None,
        recent_dialog: str | None,
    ) -> str:
        """使用 JSON 外壳生成 Mermaid 思维导图，并在失败时带校验错误重试。"""

        messages = build_mindmap_generation_messages(
            course_title=course_title,
            concept_title=concept_title,
            difficulty=task.difficulty,
            goal=task.goal,
            requirements=task.requirements,
            profile_summary=profile_summary,
            citations=citations,
            recent_dialog=recent_dialog,
            mastery_context=mastery_context,
        )
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                result = await ModelGateway(self.db).complete_chat(
                    messages=messages,
                    course_slug=course_slug,
                    agent_name="VisualAgent",
                    temperature=0.12,
                    max_tokens=1600,
                    allow_fallback=True,
                    json_mode=True,
                )
                payload = parse_mindmap_mermaid_payload(result.answer)
                content = render_mindmap_payload(payload)
                await self.publish_draft_chunks(task, content)
                return content
            except (ChatProviderError, MindmapContractError) as exc:
                last_error = exc
                logger.warning(
                    "思维导图 Mermaid JSON 生成或校验失败：task_id=%s attempt=%s course_slug=%s error=%s trace_id=%s",
                    getattr(task, "task_id", None),
                    attempt + 1,
                    course_slug,
                    str(exc),
                    get_trace_id(),
                    exc_info=True,
                )
                messages = [
                    *messages,
                    {
                        "role": "user",
                        "content": f"上一次输出未通过校验：{str(exc)[:300]}。请重新只输出满足契约的 JSON 对象，并修正 source_code。",
                    },
                ]
        raise RuntimeError(f"AI_MINDMAP_SCHEMA_INVALID: 思维导图未通过 Mermaid 结构化校验，请重试生成。原因：{last_error}")

    async def _generate_quiz_content(
        self,
        *,
        task: ResourceGenerationTask,
        course_title: str,
        course_slug: str | None,
        concept_title: str,
        citations: list[dict[str, Any]],
        profile_summary: str | None,
        mastery_context: str | None,
        recent_dialog: str | None,
    ) -> str:
        """使用 JSON 契约生成阶段测评题，并转为前端可作答 Markdown。"""

        evidence = "\n".join(
            f"- {item.get('source_title') or item.get('sourceTitle') or '课程资料'}：{str(item.get('snippet') or '')[:240]}"
            for item in citations[:5]
        )
        if not evidence.strip():
            evidence = "- 课程引用材料较少，请基于课程通用知识命题，但不要在题目中提及检索状态。"
        messages = build_quiz_generation_messages(
            course_title=course_title,
            concept_title=concept_title,
            difficulty_label=task.difficulty,
            goal=task.goal,
            requirements=task.requirements,
            profile_summary=profile_summary,
            mastery_context=mastery_context,
            recent_dialog=recent_dialog,
            evidence=evidence,
        )
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                result = await ModelGateway(self.db).complete_chat(
                    messages=messages,
                    course_slug=course_slug,
                    agent_name="ExerciseAgent",
                    temperature=0.05,
                    max_tokens=2400,
                    allow_fallback=True,
                    json_mode=True,
                )
                raw_answer = result.answer
                try:
                    payload = parse_quiz_json_payload(raw_answer)
                except Exception as strict_exc:
                    raw_json = load_quiz_json_object(raw_answer)
                    if raw_json is None:
                        raise
                    payload = normalize_quiz_payload_with_fallbacks(
                        raw_json,
                        concept_title=concept_title,
                        concept_definition=None,
                    )
                    logger.info(
                        "阶段测评题 JSON 已从模型半结构化输出修复：task_id=%s course_slug=%s error=%s trace_id=%s",
                        getattr(task, "task_id", None),
                        course_slug,
                        str(strict_exc),
                        get_trace_id(),
                    )
                content = render_quiz_markdown(payload)
                await self.publish_draft_chunks(task, content)
                return content
            except ModelGatewayBudgetLimitError:
                raise
            except QuizContractError as exc:
                last_error = exc
                logger.warning(
                    "阶段测评题 JSON 未通过结构化校验：task_id=%s attempt=%s course_slug=%s error=%s trace_id=%s",
                    getattr(task, "task_id", None),
                    attempt + 1,
                    course_slug,
                    str(exc),
                    get_trace_id(),
                )
                failed_answer = locals().get("raw_answer", "")
                messages = [*messages, build_quiz_repair_message(raw_answer=str(failed_answer), error=exc)]
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "阶段测评题 JSON 生成出现非预期异常：task_id=%s attempt=%s course_slug=%s error=%s trace_id=%s",
                    getattr(task, "task_id", None),
                    attempt + 1,
                    course_slug,
                    str(exc),
                    get_trace_id(),
                    exc_info=True,
                )
                failed_answer = locals().get("raw_answer", "")
                if failed_answer:
                    messages = [*messages, build_quiz_repair_message(raw_answer=str(failed_answer), error=exc)]
                else:
                    messages = [
                        *messages,
                        {
                            "role": "user",
                            "content": f"上一次输出未通过校验：{str(exc)[:300]}。请重新只输出满足契约的 JSON 对象。",
                        },
                    ]
        fallback = render_quiz_markdown(
            build_fallback_quiz_payload(concept_title=concept_title, concept_definition=None)
        )
        logger.warning(
            "阶段测评题结构化生成连续失败，已使用标准化兜底题单：task_id=%s course_slug=%s error=%s trace_id=%s",
            getattr(task, "task_id", None),
            course_slug,
            str(last_error),
            get_trace_id(),
        )
        await self.publish_draft_chunks(task, fallback)
        return fallback

    async def publish_draft_chunks(self, task: ResourceGenerationTask, content: str, chunk_size: int = 64) -> None:
        """按固定大小推送草稿片段，模拟流式生成的前端体验。"""

        for index in range(chunk_size, len(content) + chunk_size, chunk_size):
            partial = content[:index]
            self._update_task_draft(task, partial, min(68, 55 + index // 120))
            await self._sleep(0.04)
        self._update_task_draft(task, content, 68)

    @staticmethod
    def local_resource_template(
        course: Course | None,
        concept: CourseConcept | None,
        task: ResourceGenerationTask,
        profile_summary: str | None = None,
    ) -> str:
        """调用项目本地模板策略；生产治理下模型不可用会显式抛错。"""

        course_title = course.title if course else "通用学习"
        concept_title = concept.title if concept else (task.goal or "通用学习主题")
        return local_resource_template(
            course_title=course_title,
            concept_title=concept_title,
            resource_type=task.resource_type,
            difficulty=task.difficulty,
            goal=task.goal,
            requirements=task.requirements,
            profile_summary=profile_summary,
        )

    async def _try_stream_chat(
        self,
        task: ResourceGenerationTask,
        course_slug: str | None,
        messages: list[dict[str, str]],
    ) -> str | None:
        """优先使用模型网关流式接口生成资源正文。"""

        buffer = ""
        last_commit = 0
        events = ModelGateway(self.db).stream_chat(
            messages=messages,
            course_slug=course_slug,
            agent_name="资源生成 Agent",
            temperature=0.25,
            max_tokens=1800,
            allow_fallback=True,
        )
        while True:
            try:
                event = await anext(events)
            except StopAsyncIteration:
                break
            except ModelGatewayBudgetLimitError:
                raise
            except ChatProviderError:
                logger.warning(
                    "流式资源生成失败，准备退回阻塞式模型调用：task_id=%s course_slug=%s resource_type=%s trace_id=%s",
                    getattr(task, "task_id", None),
                    course_slug,
                    getattr(task, "resource_type", None),
                    get_trace_id(),
                    exc_info=True,
                )
                return None

            if event.get("type") == "text_delta" and event.get("delta"):
                buffer += str(event["delta"])
                if len(buffer) - last_commit >= 96:
                    preview_buffer = sanitize_generated_resource_content(buffer)
                    if preview_buffer.strip():
                        self._update_task_draft(task, preview_buffer, min(68, 55 + len(buffer) // 120))
                    last_commit = len(buffer)
            elif event.get("type") == "model_done" and event.get("answer"):
                buffer = str(event["answer"])

        final_buffer = sanitize_generated_resource_content(buffer)
        if len(final_buffer.strip()) > 200:
            return final_buffer.strip()
        logger.debug(
            "流式资源生成内容不足，准备退回阻塞式模型调用：task_id=%s course_slug=%s resource_type=%s raw_length=%s sanitized_length=%s trace_id=%s",
            getattr(task, "task_id", None),
            course_slug,
            getattr(task, "resource_type", None),
            len(buffer.strip()),
            len(final_buffer.strip()),
            get_trace_id(),
        )
        return None

    async def _try_complete_chat(
        self,
        task: ResourceGenerationTask,
        course_slug: str | None,
        messages: list[dict[str, str]],
    ) -> str | None:
        """使用阻塞式模型网关接口生成资源正文，失败时交给本地模板兜底。"""

        try:
            result = await ModelGateway(self.db).complete_chat(
                messages=messages,
                course_slug=course_slug,
                agent_name="资源生成 Agent",
                temperature=0.25,
                max_tokens=1800,
                allow_fallback=True,
            )
        except ModelGatewayBudgetLimitError:
            raise
        except ChatProviderError:
            logger.warning(
                "阻塞式资源生成失败，准备退回本地模板：task_id=%s course_slug=%s resource_type=%s trace_id=%s",
                getattr(task, "task_id", None),
                course_slug,
                getattr(task, "resource_type", None),
                get_trace_id(),
                exc_info=True,
            )
            return None

        answer = sanitize_generated_resource_content((result.answer or "").strip())
        if result.status == "success" and len(answer.strip()) > 200:
            await self.publish_draft_chunks(task, answer)
            return answer
        logger.warning(
            "阻塞式资源生成结果不可用，准备退回本地模板：task_id=%s course_slug=%s resource_type=%s gateway_status=%s provider=%s model=%s answer_length=%s error=%s trace_id=%s gateway_trace_id=%s",
            getattr(task, "task_id", None),
            course_slug,
            getattr(task, "resource_type", None),
            result.status,
            result.provider,
            result.model,
            len(answer.strip()),
            result.error,
            get_trace_id(),
            result.trace_id,
        )
        return None
