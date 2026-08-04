from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.tracing import get_trace_id
from app.models import ResourceGenerationTask, User
from app.services.resource import task_metadata
from app.services.resource.errors import ResourceTaskCancelled
from app.services.resource.outline_markdown import apply_outline_order_to_markdown
from app.services.resource.task_metadata import RESOURCE_TASK_TERMINAL_STATUSES
from app.services.resource.task_payloads import ResourceTaskPayloadService, ResourceTaskProgressPublisher


class ResourceTaskLifecycleService:
    """封装资源生成任务的大纲调整、取消和步骤状态更新。"""

    def __init__(
        self,
        db: Session,
        *,
        task_payload_service: ResourceTaskPayloadService,
        progress_publisher: ResourceTaskProgressPublisher,
    ) -> None:
        """初始化任务生命周期服务。

        参数:
            db: 当前请求范围内的数据库会话。
            task_payload_service: 任务载荷服务，用于统一发布进度事件。
            progress_publisher: 资源任务进度发布函数。
        """

        self.db = db
        self._task_payload_service = task_payload_service
        self._progress_publisher = progress_publisher

    def _user(self, external_id: str | None) -> User | None:
        """按外部用户 ID 查询任务操作用户。"""

        if not external_id:
            return None
        return self.db.execute(select(User).where(User.external_id == external_id)).scalar_one_or_none()

    def _ensure_task_access(
        self,
        task: ResourceGenerationTask,
        user_external_id: str | None,
        *,
        is_admin: bool = False,
    ) -> None:
        """校验当前用户是否可以访问或操作资源生成任务。"""

        if is_admin:
            return
        user = self._user(user_external_id)
        if not user or task.requested_by_user_id != user.id:
            raise PermissionError("无权访问该资源生成任务")

    def _raise_if_cancelled(self, task: ResourceGenerationTask) -> None:
        """在阶段边界检查用户取消状态。"""

        try:
            self.db.refresh(task)
        except Exception:
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(
                "刷新资源生成任务取消状态失败，将由外层失败处理：task_id=%s status=%s trace_id=%s",
                getattr(task, "task_id", None),
                getattr(task, "status", None),
                get_trace_id(),
                exc_info=True,
            )
            raise
        if getattr(task, "status", None) == "cancelled":
            raise ResourceTaskCancelled("资源生成任务已取消")

    def update_generation_task_outline(
        self,
        task: ResourceGenerationTask,
        sections: list[dict[str, Any]],
        user_external_id: str | None = None,
        *,
        is_admin: bool = False,
    ) -> dict[str, Any]:
        """按用户调整后的顺序更新生成任务大纲。"""

        if user_external_id is not None or is_admin:
            self._ensure_task_access(task, user_external_id, is_admin=is_admin)
        ordered = sorted(sections, key=lambda item: int(item.get("order", 0)))
        task.outline_json = [
            {
                "id": str(item.get("id") or ""),
                "level": int(item.get("level") or 2),
                "title": str(item.get("title") or "").strip(),
                "order": index,
            }
            for index, item in enumerate(ordered)
            if str(item.get("title") or "").strip()
        ]
        if task.draft_content:
            task.draft_content = apply_outline_order_to_markdown(task.draft_content, task.outline_json)
        self.db.add(task)
        self.db.commit()
        result = self._serialize_task_with_course(task)
        self.emit_task_progress(task)
        return result

    def cancel_generation_task(
        self,
        task: ResourceGenerationTask,
        user_external_id: str | None = None,
        *,
        is_admin: bool = False,
    ) -> dict[str, Any]:
        """取消尚未完成的资源生成任务。"""

        if user_external_id is not None or is_admin:
            self._ensure_task_access(task, user_external_id, is_admin=is_admin)
        if task_metadata.normalized_task_status(task) in RESOURCE_TASK_TERMINAL_STATUSES:
            return self._serialize_task_with_course(task)
        task.status = "cancelled"
        task.error_message = "资源生成任务已取消"
        task.steps_json = task_metadata.cancelled_task_steps(task.steps_json or [])
        self.db.add(task)
        self.db.commit()
        self.emit_task_progress(task)
        return self._serialize_task_with_course(task)

    def update_task_step(
        self,
        task: ResourceGenerationTask,
        index: int,
        status: str,
        detail: str | None = None,
        progress: int | None = None,
        citations: list[dict[str, Any]] | None = None,
    ) -> None:
        """更新生成任务的单个步骤状态，并同步整体任务状态。"""

        self._raise_if_cancelled(task)
        steps, next_task_status = task_metadata.update_task_step_state(
            list(task.steps_json or []),
            index,
            status,
            detail=detail,
            citations=citations,
        )
        task.steps_json = steps
        if progress is not None:
            task.progress = progress
        if next_task_status is not None:
            task.status = next_task_status
        self.db.add(task)
        self.db.commit()
        self.emit_task_progress(task)

    def emit_task_progress(self, task: ResourceGenerationTask) -> None:
        """发布资源生成任务进度事件，供 WebSocket 网关转发。"""

        self._task_payload_service.emit_task_progress(task, publisher=self._progress_publisher)

    def _serialize_task_with_course(self, task: ResourceGenerationTask) -> dict[str, Any]:
        """使用任务课程 ID 推断课程 slug 后序列化任务。"""

        return self._task_payload_service.task_to_dict(
            task,
            self._task_payload_service.course_slug_by_id(task.course_id),
        )
