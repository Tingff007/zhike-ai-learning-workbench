from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Resource, ResourceVersion, User
from app.schemas.resource import ResourceUpdateRequest
from app.services.learning.events import LearningEventRecorder
from app.services.resource.resource_serializer import ResourceSerializerService
from app.services.resource.upload_service import summarize_uploaded_content


ResourceSerializer = Callable[[Resource], dict[str, Any]]
UtcIsoFactory = Callable[[], str]


def _safe_uuid(value: str | None) -> uuid.UUID | None:
    """安全解析 UUID 字符串，非法值返回 None。"""

    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


class ResourceVersionService:
    """封装资源版本查询、手动编辑和历史版本恢复。"""

    def __init__(
        self,
        db: Session,
        *,
        serialize_resource: ResourceSerializer | None = None,
        utc_iso: UtcIsoFactory | None = None,
    ) -> None:
        """初始化资源版本服务。

        参数:
            db: 当前请求范围内的数据库会话。
            serialize_resource: 可选资源序列化回调；默认使用资源序列化服务。
            utc_iso: 可选 UTC 时间生成器，便于测试固定版本元数据。
        """

        self.db = db
        self._serialize_resource = serialize_resource or self._default_serialize_resource
        self._utc_iso = utc_iso or self._utc_now_iso

    def _resource_by_code(self, resource_id: str, *, include_deleted: bool = False) -> Resource | None:
        """按资源 code 或 UUID 查询资源，默认排除已删除资源。"""

        stmt = select(Resource).where(or_(Resource.code == resource_id, Resource.id == _safe_uuid(resource_id)))
        if not include_deleted:
            stmt = stmt.where(Resource.status != "deleted")
        return self.db.execute(stmt.order_by(Resource.updated_at.desc(), Resource.created_at.desc()).limit(1)).scalars().first()

    def _user_by_external_id(self, external_id: str | None) -> User | None:
        """按外部用户 ID 查询资源编辑用户。"""

        if not external_id:
            return None
        return self.db.execute(select(User).where(User.external_id == external_id)).scalar_one_or_none()

    def _ensure_write_access(self, resource: Resource, user_external_id: str | None, *, is_admin: bool = False) -> None:
        """校验当前用户是否可以编辑资源或恢复资源版本。"""

        if is_admin:
            return
        user = self._user_by_external_id(user_external_id)
        if not user or resource.created_by_user_id != user.id:
            raise PermissionError("无权修改该资源")

    def _ensure_read_access(self, resource: Resource, user_external_id: str | None, *, is_admin: bool = False) -> None:
        """校验当前用户是否可以读取资源版本正文。"""

        if is_admin or resource.status in {"published", "featured"}:
            return
        user = self._user_by_external_id(user_external_id)
        if not user or resource.created_by_user_id != user.id:
            raise PermissionError("无权查看该资源")

    def _default_serialize_resource(self, resource: Resource) -> dict[str, Any]:
        """使用资源序列化服务构造包含正文的详情响应。"""

        return ResourceSerializerService(self.db).resource_to_dict(resource, include_content=True)

    @staticmethod
    def _summarize_content(content: str, fallback: str) -> str:
        """根据正文生成短摘要，正文为空时保留原摘要。"""

        return summarize_uploaded_content(content, fallback)

    @staticmethod
    def _utc_now_iso() -> str:
        """返回当前 UTC ISO 时间字符串。"""

        from datetime import datetime, timezone

        return datetime.now(timezone.utc).isoformat()

    def latest_version(self, resource_id: uuid.UUID) -> ResourceVersion | None:
        """读取资源最新版本，用于详情页携带正文内容。"""

        return (
            self.db.execute(
                select(ResourceVersion)
                .where(ResourceVersion.resource_id == resource_id)
                .order_by(ResourceVersion.version.desc(), ResourceVersion.updated_at.desc(), ResourceVersion.created_at.desc())
                .limit(1)
            )
            .scalars()
            .first()
        )

    def next_version_number(self, resource_id: uuid.UUID) -> int:
        """计算资源下一次保存应使用的版本号。"""

        latest = self.db.execute(
            select(func.max(ResourceVersion.version)).where(ResourceVersion.resource_id == resource_id)
        ).scalar_one_or_none()
        return int(latest or 0) + 1

    def list_versions(
        self,
        resource_code: str,
        user_external_id: str | None = None,
        *,
        is_admin: bool = False,
    ) -> dict[str, Any]:
        """列出指定资源的历史版本内容和版本元数据，私有资源必须校验归属。"""

        resource = self._resource_by_code(resource_code)
        if not resource:
            return {"resource_id": resource_code, "items": []}
        self._ensure_read_access(resource, user_external_id, is_admin=is_admin)
        rows = self.db.execute(
            select(ResourceVersion).where(ResourceVersion.resource_id == resource.id).order_by(ResourceVersion.version.desc())
        ).scalars().all()
        return {
            "resource_id": resource.code,
            "items": [
                {
                    "id": str(item.id),
                    "version": item.version,
                    "content": item.content,
                    "meta": item.meta_json or {},
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                }
                for item in rows
            ],
        }

    def restore_version(
        self,
        resource_code: str,
        version_number: int,
        user_external_id: str | None = None,
        *,
        is_admin: bool = False,
    ) -> dict[str, Any] | None:
        """从历史版本恢复资源内容，并生成新的当前版本。"""

        resource = self._resource_by_code(resource_code)
        if not resource:
            return None
        if user_external_id is not None or is_admin:
            self._ensure_write_access(resource, user_external_id, is_admin=is_admin)
        target = self.db.execute(
            select(ResourceVersion).where(
                ResourceVersion.resource_id == resource.id,
                ResourceVersion.version == version_number,
            )
        ).scalar_one_or_none()
        if not target:
            return None
        latest = self.latest_version(resource.id)
        if latest and latest.version == version_number:
            return self._serialize_resource(resource)
        next_version = self.next_version_number(resource.id)
        self.db.add(
            ResourceVersion(
                resource_id=resource.id,
                version=next_version,
                content=target.content,
                meta_json={
                    "source": "rollback",
                    "restored_from_version": version_number,
                    "restored_at": self._utc_iso(),
                },
            )
        )
        resource.summary = self._summarize_content(target.content, resource.summary)
        if resource.course_id:
            LearningEventRecorder(self.db).record(
                course_id=resource.course_id,
                user_id=resource.created_by_user_id,
                concept_id=resource.concept_id,
                event_type="resource_version_restored",
                source_type="resource",
                source_id=resource.code,
                evidence={
                    "restored_from_version": version_number,
                    "new_version": next_version,
                },
            )
        self.db.commit()
        self.db.refresh(resource)
        return self._serialize_resource(resource)

    def update_resource(
        self,
        resource_code: str,
        payload: ResourceUpdateRequest,
        user_external_id: str | None = None,
        *,
        is_admin: bool = False,
    ) -> dict[str, Any] | None:
        """更新资源基础信息或追加手动编辑版本。"""

        resource = self._resource_by_code(resource_code)
        if not resource:
            return None
        if user_external_id is not None or is_admin:
            self._ensure_write_access(resource, user_external_id, is_admin=is_admin)
        if payload.title is not None:
            resource.title = payload.title
        if payload.summary is not None:
            resource.summary = payload.summary
        if payload.status is not None:
            resource.status = payload.status
        if payload.difficulty is not None:
            resource.difficulty = payload.difficulty
        if payload.content is not None:
            version = self.next_version_number(resource.id)
            self.db.add(
                ResourceVersion(
                    resource_id=resource.id,
                    version=version,
                    content=payload.content,
                    meta_json={"source": "manual_edit", "edited_at": self._utc_iso()},
                )
            )
            resource.summary = payload.summary or self._summarize_content(payload.content, resource.summary)
        if resource.course_id:
            LearningEventRecorder(self.db).record(
                course_id=resource.course_id,
                user_id=resource.created_by_user_id,
                concept_id=resource.concept_id,
                event_type="resource_updated",
                source_type="resource",
                source_id=resource.code,
                evidence={
                    "status": resource.status,
                    "content_version_added": payload.content is not None,
                    "quality_score": resource.quality_score,
                    "next_actions": ["use_resource", "submit_review"] if resource.status == "private" else ["review_governance"],
                },
            )
        self.db.commit()
        self.db.refresh(resource)
        return self._serialize_resource(resource)
