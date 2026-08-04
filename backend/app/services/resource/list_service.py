from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any, TypeAlias

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Course, CourseConcept, Resource, User

ResourceSerializer: TypeAlias = Callable[[Resource, str | None], dict[str, Any]]
KnowledgeCitationChecker: TypeAlias = Callable[[Resource], bool]


def _safe_uuid(value: str | None) -> uuid.UUID | None:
    """把外部传入的字符串安全转换为 UUID，非法值返回 None。"""

    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


class ResourceListService:
    """封装普通资源列表查询、筛选和序列化编排。

    参数:
        db: 当前请求范围内的数据库会话。
        resource_serializer: 资源实体到前端字典的转换函数。
        knowledge_citation_checker: 判断资源是否仍保有可用知识库引用的函数。
    """

    def __init__(
        self,
        db: Session,
        *,
        resource_serializer: ResourceSerializer,
        knowledge_citation_checker: KnowledgeCitationChecker,
    ) -> None:
        self.db = db
        self.resource_serializer = resource_serializer
        self.knowledge_citation_checker = knowledge_citation_checker

    def list_resources(
        self,
        *,
        course_slug: str | None = None,
        concept_code: str | None = None,
        resource_type: str | None = None,
        difficulty: str | None = None,
        public_only: bool = False,
        require_knowledge_link: bool = False,
        current_user: User | None = None,
        include_all: bool = False,
    ) -> list[dict[str, Any]]:
        """按课程、知识点、资源属性与用户可见性筛选资源列表。

        私有和待审核资源只允许创建者本人查看；已发布或精选资源可作为课程共享资源展示。
        管理员通过 include_all 显式绕过用户可见性过滤，用于审核和运维场景。
        """

        stmt = select(Resource, Course).join(Course, Course.id == Resource.course_id, isouter=True).where(Resource.status != "deleted")
        if course_slug:
            stmt = stmt.where(or_(Course.slug == course_slug, Course.id == _safe_uuid(course_slug)))
        if concept_code:
            stmt = stmt.join(CourseConcept, CourseConcept.id == Resource.concept_id).where(
                or_(CourseConcept.code == concept_code, CourseConcept.id == _safe_uuid(concept_code))
            )
        if resource_type:
            stmt = stmt.where(Resource.resource_type == resource_type)
        if difficulty:
            stmt = stmt.where(Resource.difficulty == difficulty)
        if public_only:
            stmt = stmt.where(Resource.status.in_(("published", "featured")))
        elif not include_all:
            visibility_clauses = [Resource.status.in_(("published", "featured"))]
            if current_user:
                visibility_clauses.append(Resource.created_by_user_id == current_user.id)
            stmt = stmt.where(or_(*visibility_clauses))
        stmt = stmt.order_by(Resource.status.desc(), Resource.quality_score.desc(), Resource.created_at.desc())
        rows = self.db.execute(stmt).all()
        return [
            self.resource_serializer(resource, course.slug if course else None)
            for resource, course in rows
            if not require_knowledge_link or self.knowledge_citation_checker(resource)
        ]
