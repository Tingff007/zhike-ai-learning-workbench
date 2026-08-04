from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.models import ResourceGenerationTask
from app.services.resource import task_metadata
from app.services.resource.generation_content_service import ResourceGenerationContentService
from app.services.resource.generation_context_service import TaskStepUpdater
from app.services.resource.generation_result_service import ResourceGenerationResultService
from app.services.resource.outline_markdown import parse_outline_sections, sections_to_outline_json
from app.services.resource.prompts import (
    build_personalization_metadata,
    resolve_effective_resource_type,
    sanitize_generated_resource_content,
)
from app.services.safety.guardrail import SafetyGuardrail


ResourceWorkflowNode = Callable[[dict[str, Any]], dict[str, Any] | Awaitable[dict[str, Any]]]


class CourseTaskDraftUpdater(Protocol):
    """课程资源任务草稿更新回调，避免节点服务直接依赖仓储门面。"""

    def __call__(self, task: ResourceGenerationTask, content: str, progress: int | None = None) -> None:
        """写入任务草稿内容和可选进度。"""


class CourseTaskProgressEmitter(Protocol):
    """课程资源任务进度事件发布回调。"""

    def __call__(self, task: ResourceGenerationTask) -> None:
        """发布当前任务进度快照。"""


class ResourceCourseTaskRunner:
    """编排绑定课程资料的资源生成节点。"""

    def __init__(
        self,
        db: Session,
        *,
        content_service: ResourceGenerationContentService,
        result_service: ResourceGenerationResultService,
        update_task_step: TaskStepUpdater,
        update_task_draft: CourseTaskDraftUpdater,
        emit_task_progress: CourseTaskProgressEmitter,
    ) -> None:
        """初始化课程资源任务节点编排器。

        参数:
            db: 当前任务使用的数据库会话。
            content_service: 资源正文生成服务。
            result_service: 质量核验和资源落库服务。
            update_task_step: 任务步骤更新回调。
            update_task_draft: 任务草稿更新回调。
            emit_task_progress: 任务进度发布回调。
        """

        self.db = db
        self.content_service = content_service
        self.result_service = result_service
        self.update_task_step = update_task_step
        self.update_task_draft = update_task_draft
        self.emit_task_progress = emit_task_progress

    async def run_without_graph(
        self,
        state: dict[str, Any],
        *,
        retrieve_node: ResourceWorkflowNode,
        profile_node: ResourceWorkflowNode,
    ) -> dict[str, Any]:
        """在缺少 LangGraph 依赖时按固定顺序执行课程资源生成节点。"""

        state = {**state, **await self._resolve_node_result(retrieve_node(state))}
        state = {**state, **await self._resolve_node_result(profile_node(state))}
        state = {**state, **await self.generate_node(state)}
        state = {**state, **self.cite_check_node(state)}
        state = {**state, **self.safety_node(state)}
        state = {**state, **self.save_node(state)}
        return state

    async def generate_node(self, state: dict[str, Any]) -> dict[str, Any]:
        """执行正文生成节点，调用模型网关并同步任务草稿。"""

        task = state["task"]
        self.update_task_step(task, 2, "running", "正在调用模型网关生成资源", 55)
        content = await self.content_service.generate_resource_content(
            state["course"],
            state.get("concept"),
            task,
            state.get("citations") or [],
            profile_summary=state.get("profile_summary"),
            mastery_context=state.get("mastery_context"),
            recent_dialog=state.get("recent_dialog"),
        )
        content = sanitize_generated_resource_content(content)
        self.update_task_draft(task, content, progress=70)
        task.outline_json = sections_to_outline_json(parse_outline_sections(content))
        self.db.add(task)
        self.db.commit()
        effective_type = resolve_effective_resource_type(task.resource_type, task.goal, task.requirements)
        personalization = build_personalization_metadata(state.get("profile_summary"), effective_type, task.difficulty)
        self.update_task_step(task, 2, "completed", "资源草稿已生成", 70)
        return {"content": content, "personalization": personalization, "task": task}

    def cite_check_node(self, state: dict[str, Any]) -> dict[str, Any]:
        """执行引用核验节点，并把引用覆盖状态写回任务编排元数据。"""

        task = state["task"]
        quality = self.result_service.quality_check(state.get("content", ""), state.get("citations") or [])
        self.update_task_step(task, 3, "completed", quality["summary"], 84)
        task.orchestration_json = {
            **task_metadata.task_orchestration(task),
            "citationCoverage": quality.get("citation_coverage"),
        }
        self.db.add(task)
        self.db.commit()
        self.emit_task_progress(task)
        return {"quality": quality, "task": task}

    def safety_node(self, state: dict[str, Any]) -> dict[str, Any]:
        """执行安全审查节点，阻断被安全策略拒绝的生成结果。"""

        task = state["task"]
        safety = SafetyGuardrail().check_output(state.get("content", ""))
        status = safety.get("status", "passed")
        detail = "未发现明显风险" if status == "passed" else f"安全审查：{status} · {', '.join(safety.get('flags') or [])}"
        if status == "blocked":
            self.update_task_step(task, 4, "failed", detail, 94)
            raise RuntimeError(f"SAFETY_BLOCKED: {detail}")
        self.update_task_step(task, 4, "completed", detail, 94)
        return {"safety_status": status, "task": task}

    def save_node(self, state: dict[str, Any]) -> dict[str, Any]:
        """执行资源保存节点，持久化资源实体和首个版本。"""

        task = state["task"]
        self.update_task_step(task, 5, "running", "正在保存资源与版本", 97)
        resource = self.result_service.save_generated_resource(
            state["course"],
            state.get("concept"),
            task,
            state.get("content", ""),
            state.get("citations") or [],
            state.get("quality") or {},
            state.get("safety_status") or "passed",
            personalization=state.get("personalization"),
            profile_context_snapshot=state.get("profile_context_snapshot"),
        )
        self.update_task_step(task, 5, "completed", f"资源已保存：{resource.code}", 99)
        return {"resource": resource, "task": task}

    @staticmethod
    async def _resolve_node_result(result: dict[str, Any] | Awaitable[dict[str, Any]]) -> dict[str, Any]:
        """兼容同步节点和异步节点，统一返回工作流状态。"""

        if hasattr(result, "__await__"):
            return await result
        return result
