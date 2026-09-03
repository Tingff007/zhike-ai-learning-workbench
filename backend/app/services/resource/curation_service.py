from __future__ import annotations

from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CommunityResource, Course, CourseConcept, PathNode, Resource, ResourceVersion, User
from app.services.learning.events import LearningEventRecorder
from app.services.resource.copy_payloads import build_resource_copy_payload, build_resource_copy_version_payload


class ResourceCurationService:
    """封装资源复制、社区提交和课程归档等人工整理类业务动作。"""

    def __init__(self, db: Session, *, utc_iso: Callable[[], str]) -> None:
        """初始化资源整理服务。

        参数:
            db: 当前请求范围内的数据库会话。
            utc_iso: 统一 UTC 时间字符串工厂，用于审计和事件证据。
        """

        self.db = db
        self._utc_iso = utc_iso

    def copy_resource(
        self,
        *,
        source: Resource,
        latest_version: ResourceVersion | None,
        user: User | None,
        copy_code: str,
    ) -> Resource:
        """复制资源为当前用户可编辑的私有副本，并记录首个版本和学习事件。"""

        copied = Resource(**build_resource_copy_payload(source, copy_code, user.id if user else None))
        source.copied_count = (source.copied_count or 0) + 1
        self.db.add(copied)
        self.db.flush()
        self.db.add(ResourceVersion(**build_resource_copy_version_payload(copied.id, source, latest_version)))
        if copied.course_id:
            self._record_resource_copied_event(copied, source, user)
        self.db.commit()
        return copied

    def submit_community(
        self,
        *,
        resource: Resource,
        course: Course | None,
        user: User | None,
    ) -> dict[str, str]:
        """将资源提交到社区审核队列，并记录课程学习事件。"""

        existing = self.db.execute(select(CommunityResource).where(CommunityResource.resource_id == resource.id)).scalar_one_or_none()
        if not existing:
            self.db.add(
                CommunityResource(
                    resource_id=resource.id,
                    course_id=course.id if course else None,
                    submitted_by_user_id=user.id if user else None,
                    review_status="pending_review",
                    review_result_json={},
                )
            )
        resource.status = "pending_review"
        if course:
            self._record_resource_submitted_event(resource, course, user)
        self.db.commit()
        return {"resource_id": resource.code, "status": "pending_review"}

    def archive_resource_to_course(
        self,
        *,
        resource: Resource,
        course: Course,
        concept: CourseConcept | None,
        path_node: PathNode | None,
        user: User | None,
        community: CommunityResource | None,
        requested_path_node_id: str | None,
    ) -> Resource:
        """把通用资源绑定到课程上下文，并同步社区记录和学习事件。"""

        was_general = resource.course_id is None
        resource.course_id = course.id
        resource.concept_id = concept.id if concept else None
        resource.path_node_id = path_node.id if path_node else None
        resource.generation_basis_json = {
            **(resource.generation_basis_json or {}),
            "scope": "course",
            "courseId": course.slug,
            "conceptId": concept.code if concept else None,
            "archivedFromGeneral": was_general,
            "archivedAt": self._utc_iso(),
        }
        if community:
            community.course_id = course.id
        self._record_resource_archived_event(
            resource,
            course,
            concept,
            path_node,
            user,
            was_general=was_general,
            requested_path_node_id=requested_path_node_id,
        )
        self.db.commit()
        self.db.refresh(resource)
        return resource

    def _record_resource_copied_event(self, copied: Resource, source: Resource, user: User | None) -> None:
        """记录资源复制学习事件，供课程画像和资源复用分析消费。"""

        LearningEventRecorder(self.db).record(
            course_id=copied.course_id,
            user_id=user.id if user else None,
            concept_id=copied.concept_id,
            event_type="resource_copied",
            source_type="resource",
            source_id=copied.code,
            evidence={
                "copied_from": source.code,
                "quality_score": copied.quality_score,
                "status": copied.status,
                "next_actions": ["edit_version", "submit_review"],
            },
        )

    def _record_resource_submitted_event(self, resource: Resource, course: Course, user: User | None) -> None:
        """记录资源提交审核事件，保留引用、安全和质量上下文。"""

        LearningEventRecorder(self.db).record(
            course_id=course.id,
            user_id=user.id if user else resource.created_by_user_id,
            concept_id=resource.concept_id,
            event_type="resource_submitted_for_review",
            source_type="resource",
            source_id=resource.code,
            evidence={
                "review_status": "pending_review",
                "quality_score": resource.quality_score,
                "citation_count": len(resource.citations_json or []),
                "safety_status": resource.safety_status,
                "next_actions": ["admin_review", "citation_check", "quality_ranking"],
            },
        )

    def _record_resource_archived_event(
        self,
        resource: Resource,
        course: Course,
        concept: CourseConcept | None,
        path_node: PathNode | None,
        user: User | None,
        *,
        was_general: bool,
        requested_path_node_id: str | None,
    ) -> None:
        """记录通用资源归档到课程后的学习事件。"""

        LearningEventRecorder(self.db).record(
            course_id=course.id,
            user_id=user.id if user else resource.created_by_user_id,
            concept_id=concept.id if concept else None,
            event_type="resource_archived_to_course",
            source_type="resource",
            source_id=resource.code,
            evidence={
                "resource_type": resource.resource_type,
                "archived_from_general": was_general,
                "path_node_id": path_node.code if path_node else requested_path_node_id,
                "next_actions": ["use_resource", "submit_review", "bind_to_path"],
            },
        )
