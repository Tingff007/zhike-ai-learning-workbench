from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Course, ResourceGenerationTask, User
from app.services.resource.task_payloads import ResourceTaskPayloadService


def _safe_uuid(value: str | None) -> uuid.UUID | None:
    """把外部任务、课程或用户标识安全转换为 UUID。"""

    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


class ResourceGenerationTaskQueryService:
    """封装资源生成任务查询、课程过滤和访问控制。"""

    def __init__(self, db: Session, *, task_payload_service: ResourceTaskPayloadService) -> None:
        """初始化资源生成任务查询服务。

        参数:
            db: 当前请求使用的数据库会话。
            task_payload_service: 任务对外响应载荷序列化服务。
        """

        self.db = db
        self.task_payload_service = task_payload_service

    def get_generation_task(
        self,
        task_id: str,
        user_external_id: str | None = None,
        *,
        is_admin: bool = False,
    ) -> dict[str, Any] | None:
        """读取单个资源生成任务，并在需要时校验访问权限。

        参数:
            task_id: 资源生成任务 ID。
            user_external_id: 当前用户外部 ID；为空时不做归属校验以兼容内部调用。
            is_admin: 是否按管理员权限读取。

        返回:
            任务不存在时返回 None；存在时返回前端任务状态字典。

        抛出:
            PermissionError: 当前用户不是任务发起者且不具备管理员权限。
        """

        task = self.db.get(ResourceGenerationTask, _safe_uuid(task_id))
        if not task:
            return None
        if user_external_id is not None or is_admin:
            self.ensure_task_access(task, user_external_id, is_admin=is_admin)
        return self.task_payload_service.task_to_dict(task, self.task_payload_service.course_slug_by_id(task.course_id))

    def list_generation_tasks(
        self,
        course_slug: str | None = None,
        limit: int = 20,
        user_external_id: str | None = None,
        *,
        include_all: bool = True,
    ) -> list[dict[str, Any]]:
        """按课程和用户范围列出资源生成任务。

        参数:
            course_slug: 可选课程 slug 或 UUID。
            limit: 返回数量上限。
            user_external_id: 当前用户外部 ID。
            include_all: 是否返回所有用户任务；False 时只返回当前用户任务。

        返回:
            按创建时间倒序排列的任务状态字典列表；课程或用户不存在时返回空列表。
        """

        stmt = select(ResourceGenerationTask)
        if course_slug:
            course = self._course(course_slug)
            if not course:
                return []
            stmt = stmt.where(ResourceGenerationTask.course_id == course.id)
        if not include_all:
            user = self._user(user_external_id)
            if not user:
                return []
            stmt = stmt.where(ResourceGenerationTask.requested_by_user_id == user.id)
        stmt = stmt.order_by(ResourceGenerationTask.created_at.desc()).limit(limit)
        return [
            self.task_payload_service.task_to_dict(task, self.task_payload_service.course_slug_by_id(task.course_id))
            for task in self.db.execute(stmt).scalars().all()
        ]

    def ensure_task_access(
        self,
        task: ResourceGenerationTask,
        user_external_id: str | None,
        *,
        is_admin: bool = False,
    ) -> None:
        """校验当前用户是否可以访问资源生成任务。"""

        if is_admin:
            return
        user = self._user(user_external_id)
        if not user or task.requested_by_user_id != user.id:
            raise PermissionError("无权访问该资源生成任务")

    def _course(self, slug_or_id: str | None) -> Course | None:
        """按 slug 或 UUID 查询课程。"""

        if not slug_or_id:
            return None
        return self.db.execute(
            select(Course).where(or_(Course.slug == slug_or_id, Course.id == _safe_uuid(slug_or_id)))
        ).scalar_one_or_none()

    def _user(self, external_id: str | None) -> User | None:
        """按外部用户 ID 查询用户。"""

        if not external_id:
            return None
        return self.db.execute(select(User).where(User.external_id == external_id)).scalar_one_or_none()
