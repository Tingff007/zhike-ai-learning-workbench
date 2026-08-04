from __future__ import annotations

from collections.abc import Callable, Sequence

from sqlalchemy.orm import Session

from app.models import CommunityResource, Resource, User
from app.services.learning.events import LearningEventRecorder
from app.services.resource.deletion_results import (
    DELETE_REASON_NOT_OWNER,
    DELETE_REASON_RESOURCE_NOT_FOUND,
    ResourceBatchDeleteResult,
    ResourceDeleteRejectedItem,
    ResourceDeleteResult,
    build_batch_delete_result,
    build_delete_rejection,
    build_delete_result,
)


ResolvedDeleteTarget = tuple[str, Resource | None, CommunityResource | None]


class ResourceDeletionService:
    """封装个人资源软删除、审核记录归档和批量删除结果汇总。"""

    def __init__(self, db: Session, *, utc_iso: Callable[[], str]) -> None:
        """初始化资源删除服务。

        参数:
            db: 当前请求范围内的数据库会话。
            utc_iso: 统一 UTC 时间字符串工厂，用于删除审计元数据。
        """

        self.db = db
        self._utc_iso = utc_iso

    def delete_own_resource(
        self,
        *,
        resource: Resource,
        user: User | None,
        community: CommunityResource | None,
    ) -> ResourceDeleteResult:
        """软删除当前用户自己的资源，并提交数据库事务。"""

        if not user or resource.created_by_user_id != user.id:
            raise PermissionError(DELETE_REASON_NOT_OWNER)
        result = self.mark_own_resource_deleted(resource, user, community)
        self.db.commit()
        return result

    def batch_delete_own_resources(
        self,
        *,
        targets: Sequence[ResolvedDeleteTarget],
        user: User | None,
    ) -> ResourceBatchDeleteResult:
        """批量软删除当前用户资源，并为缺失或非本人资源生成拒绝项。"""

        if not user:
            raise PermissionError(DELETE_REASON_NOT_OWNER)

        deleted: list[ResourceDeleteResult] = []
        rejected: list[ResourceDeleteRejectedItem] = []
        for resource_code, resource, community in targets:
            if not resource:
                rejected.append(build_delete_rejection(resource_code, DELETE_REASON_RESOURCE_NOT_FOUND))
                continue
            if resource.created_by_user_id != user.id:
                rejected.append(build_delete_rejection(resource_code, DELETE_REASON_NOT_OWNER))
                continue
            deleted.append(self.mark_own_resource_deleted(resource, user, community))

        if deleted:
            self.db.commit()
        return build_batch_delete_result(deleted, rejected)

    def mark_own_resource_deleted(
        self,
        resource: Resource,
        user: User,
        community: CommunityResource | None,
    ) -> ResourceDeleteResult:
        """标记当前用户自己的资源为已删除，并写入审计元数据。"""

        deleted_at = self._utc_iso()
        previous_status = resource.status
        resource.status = "deleted"
        resource.generation_basis_json = {
            **(resource.generation_basis_json or {}),
            "previousStatus": previous_status,
            "deletedAt": deleted_at,
            "deletedByUserId": user.external_id,
        }
        if community:
            self._archive_community_review(community, deleted_at, previous_status=community.review_status)
        if resource.course_id:
            self._record_resource_deleted_event(resource, user, previous_status, deleted_at)
        return build_delete_result(resource.code, deleted_at)

    @staticmethod
    def _archive_community_review(
        community: CommunityResource,
        deleted_at: str,
        *,
        previous_status: str,
    ) -> None:
        """资源所有者删除资源时，同步归档社区审核记录。"""

        review_result = dict(community.review_result_json or {})
        review_result.update(
            {
                "archived_reason": "owner_deleted",
                "deleted_at": deleted_at,
                "previous_review_status": previous_status,
            }
        )
        community.review_status = "archived"
        community.review_result_json = review_result

    def _record_resource_deleted_event(
        self,
        resource: Resource,
        user: User,
        previous_status: str,
        deleted_at: str,
    ) -> None:
        """写入资源删除学习事件，保留可恢复的审计证据。"""

        LearningEventRecorder(self.db).record(
            course_id=resource.course_id,
            user_id=user.id,
            concept_id=resource.concept_id,
            event_type="resource_deleted",
            source_type="resource",
            source_id=resource.code,
            evidence={
                "previous_status": previous_status,
                "deleted_at": deleted_at,
                "resource_type": resource.resource_type,
                "soft_delete": True,
            },
        )
