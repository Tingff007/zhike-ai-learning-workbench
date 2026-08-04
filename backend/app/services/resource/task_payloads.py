from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from app.models import Course, CourseConcept, Resource, ResourceGenerationTask
from app.services.resource import task_metadata
from app.services.resource.asset_service import ResourceAssetService
from app.services.resource.errors import parse_generation_error
from app.services.resource.outline_markdown import parse_outline_sections, sections_to_outline_json
from app.services.resource.progress_events import publish_resource_task_progress
from app.services.resource.prompts import TYPE_LABELS


ResourceTaskProgressPublisher = Callable[[str, dict[str, Any]], bool]


class ResourceTaskPayloadService:
    """负责资源生成任务的对外载荷序列化和进度事件发布。"""

    def __init__(self, db: Session, asset_service: ResourceAssetService | None = None) -> None:
        """初始化任务载荷服务。

        参数:
            db: 当前请求或后台任务使用的数据库会话。
            asset_service: 可复用的资产服务；未传入时按当前数据库会话创建。
        """
        self.db = db
        self.asset_service = asset_service or ResourceAssetService(db)

    def course_slug_by_id(self, course_id: uuid.UUID | None) -> str | None:
        """按课程 ID 读取对外课程标识，课程缺失时回退为 UUID 字符串。"""

        if course_id is None:
            return None
        course = self.db.get(Course, course_id)
        return course.slug if course else str(course_id)

    def concept_code_by_id(self, concept_id: uuid.UUID | None) -> str | None:
        """按知识点 ID 读取对外知识点编码，便于前端提交测评画像证据。"""

        if concept_id is None:
            return None
        concept = self.db.get(CourseConcept, concept_id)
        return concept.code if concept else str(concept_id)

    def task_to_dict(self, task: ResourceGenerationTask, course_slug: str | None = None) -> dict[str, Any]:
        """将资源生成任务实体序列化为前端轮询和 WebSocket 推送载荷。

        参数:
            task: 资源生成任务实体。
            course_slug: 已知课程 slug；为空时服务会按任务课程 ID 查询。

        返回:
            前端任务卡片、轮询接口和 WebSocket 事件共享的任务状态字典。
        """

        result_resource = self.db.get(Resource, task.result_resource_id) if task.result_resource_id else None
        citations = (
            list(getattr(result_resource, "citations_json", []) or [])
            if result_resource
            else self.citations_from_task_steps(task.steps_json or [])
        )
        steps = [step for step in (task.steps_json or []) if isinstance(step, dict)]
        orchestration = task_metadata.task_orchestration(task)
        need_evidence = task_metadata.task_requires_course_evidence(task)
        quality = getattr(result_resource, "quality_check_result", None) or {}
        status = task_metadata.normalized_task_status(task)
        result_resource_id = getattr(result_resource, "id", None) or task.result_resource_id
        assets = self.asset_service.assets_for_resource(result_resource_id) if result_resource_id else self.asset_service.assets_for_task(task.id)
        return {
            "task_id": str(task.id),
            "status": status,
            "course_id": course_slug if course_slug is not None else self.course_slug_by_id(task.course_id),
            "scope": "course" if task.course_id else "general",
            "resource_type": task.resource_type,
            "resource_type_label": TYPE_LABELS.get(task.resource_type, task.resource_type),
            "concept_id": self.concept_code_by_id(getattr(task, "concept_id", None)),
            "path_node_id": str(task.path_node_id) if task.path_node_id else None,
            "difficulty": task.difficulty,
            "progress": task.progress,
            "steps": task.steps_json or [],
            "draft_content": task.draft_content,
            "outline_json": task.outline_json or [],
            "citations": citations,
            "need_course_evidence": need_evidence,
            "course_evidence_required": need_evidence,
            "current_agent": task_metadata.current_agent_from_steps(steps),
            "citation_coverage": quality.get("citation_coverage") or orchestration.get("citationCoverage"),
            "result_resource_id": str(task.result_resource_id) if task.result_resource_id else None,
            "result_resource_code": getattr(result_resource, "code", None) if result_resource else None,
            "error_code": task_metadata.task_error_code(task.error_message),
            "orchestration": orchestration,
            "assets": assets,
            **self.task_error_fields(task.error_message),
        }

    @staticmethod
    def citations_from_task_steps(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """从任务步骤中提取生成前检索到的真实引用依据。"""

        for step in steps:
            citations = step.get("citations") if isinstance(step, dict) else None
            if isinstance(citations, list):
                return [item for item in citations if isinstance(item, dict)]
        return []

    @staticmethod
    def task_error_fields(message: str | None) -> dict[str, str | None]:
        """把内部错误信息转换为安全的摘要和根因字段。"""

        summary, root = parse_generation_error(message)
        return {
            "error_message": summary,
            "error_root_cause": root,
        }

    def emit_task_progress(
        self,
        task: ResourceGenerationTask,
        *,
        publisher: ResourceTaskProgressPublisher = publish_resource_task_progress,
    ) -> None:
        """发布资源生成任务进度事件，供 WebSocket 网关转发。"""

        publisher(str(task.id), self.task_to_dict(task, self.course_slug_by_id(task.course_id)))

    def update_task_draft(
        self,
        task: ResourceGenerationTask,
        content: str,
        progress: int | None = None,
        *,
        publisher: ResourceTaskProgressPublisher = publish_resource_task_progress,
    ) -> None:
        """更新任务草稿内容、进度和可编辑大纲，并同步推送最新进度。"""

        task.draft_content = content
        if progress is not None:
            task.progress = progress
        if content and not task.outline_json:
            task.outline_json = sections_to_outline_json(parse_outline_sections(content))
        self.db.add(task)
        self.db.commit()
        self.emit_task_progress(task, publisher=publisher)
