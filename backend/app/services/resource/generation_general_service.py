from __future__ import annotations

from typing import Any, Protocol

from app.models import Resource, ResourceGenerationTask
from app.services.resource.generation_content_service import ResourceGenerationContentService
from app.services.resource.generation_context_service import ResourceGenerationContextService, TaskStepUpdater
from app.services.resource.generation_result_service import ResourceGenerationResultService
from app.services.resource.outline_markdown import parse_outline_sections, sections_to_outline_json
from app.services.resource.prompts import TYPE_LABELS, build_personalization_metadata, sanitize_generated_resource_content
from app.services.safety.guardrail import SafetyGuardrail


class GeneralTaskDraftUpdater(Protocol):
    """通用资源任务草稿更新回调，避免服务直接依赖仓储门面。"""

    def __call__(self, task: ResourceGenerationTask, content: str, progress: int | None = None) -> None:
        """写入任务草稿内容和可选进度。"""


class ResourceGeneralTaskRunner:
    """编排不绑定课程资料的通用资源生成任务。"""

    def __init__(
        self,
        *,
        context_service: ResourceGenerationContextService,
        content_service: ResourceGenerationContentService,
        result_service: ResourceGenerationResultService,
        update_task_step: TaskStepUpdater,
        update_task_draft: GeneralTaskDraftUpdater,
    ) -> None:
        """初始化通用资源任务编排器。

        参数:
            context_service: 学习画像和近期对话上下文服务。
            content_service: 资源正文生成服务。
            result_service: 质量核验和资源落库服务。
            update_task_step: 任务步骤更新回调。
            update_task_draft: 任务草稿更新回调。
        """

        self.context_service = context_service
        self.content_service = content_service
        self.result_service = result_service
        self.update_task_step = update_task_step
        self.update_task_draft = update_task_draft

    async def run(self, state: dict[str, Any]) -> dict[str, Any]:
        """执行通用资源生成任务，并返回可合并到工作流的状态。"""

        task = state["task"]
        topic = (task.goal or task.requirements or "通用学习主题").strip()[:120]
        self.update_task_step(task, 0, "completed", f"通用资源主题：{topic}", 28)
        resource_label = TYPE_LABELS.get(task.resource_type, task.resource_type)
        self.update_task_draft(task, f"# {topic}\n\n_正在生成{resource_label}…_\n", progress=36)
        profile_summary = self.context_service.profile_summary_for_task(
            task,
            None,
            default_summary="暂无画像摘要，按通用学习者默认处理。",
        )
        self.update_task_step(task, 1, "running", "正在调用模型网关生成通用资源", 55)
        content = await self.content_service.generate_resource_content(
            None,
            None,
            task,
            [],
            profile_summary=profile_summary,
            mastery_context="",
            recent_dialog=self.context_service.recent_dialog_for_task(task),
        )
        content = sanitize_generated_resource_content(content)
        self.update_task_draft(task, content, progress=76)
        task.outline_json = sections_to_outline_json(parse_outline_sections(content))
        self.update_task_step(task, 1, "completed", "通用资源草稿已生成", 76)
        safety_status = self._check_safety(task, content)
        self.update_task_step(task, 3, "running", "正在保存通用资源与版本", 97)
        quality = self.result_service.quality_check(content, [])
        resource = self.result_service.save_generated_resource(
            None,
            None,
            task,
            content,
            [],
            quality,
            safety_status,
            personalization=build_personalization_metadata(profile_summary, task.resource_type, task.difficulty),
            profile_context_snapshot=profile_summary,
        )
        self.update_task_step(task, 3, "completed", f"通用资源已保存：{resource.code}", 99)
        return {
            "task": task,
            "content": content,
            "quality": quality,
            "safety_status": safety_status,
            "resource": resource,
        }

    def _check_safety(self, task: ResourceGenerationTask, content: str) -> str:
        """执行通用资源安全审查，并在阻断时抛出可观测错误。"""

        safety = SafetyGuardrail().check_output(content)
        safety_status = safety.get("status", "passed")
        safety_detail = "未发现明显风险" if safety_status == "passed" else f"安全审查：{safety_status} · {', '.join(safety.get('flags') or [])}"
        if safety_status == "blocked":
            self.update_task_step(task, 2, "failed", safety_detail, 92)
            raise RuntimeError(f"SAFETY_BLOCKED: {safety_detail}")
        self.update_task_step(task, 2, "completed", safety_detail, 92)
        return str(safety_status)
