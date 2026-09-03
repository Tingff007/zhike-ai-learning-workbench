from __future__ import annotations

import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Callable, TypeAlias

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import CommunityResource, Course, Resource, User
from app.services.resource.hall_helpers import (
    hall_filter_options,
    hall_match_reason,
    hall_recommendation_score,
    hall_sort_time,
    is_featured_hall_resource,
    is_public_hall_resource,
    matches_hall_scope,
)
from app.services.resource.hall_recommendation_service import ResourceHallRecommendationService
from app.services.resource.prompts import DIFFICULTY_LABELS, TYPE_LABELS

ResourceSerializer: TypeAlias = Callable[[Resource, str | None], dict[str, Any]]
HallRow: TypeAlias = tuple[float, Resource, Course | None, CommunityResource | None]


def _utc_iso() -> str:
    """返回统一的 UTC ISO 时间字符串，供大厅响应标记生成时间。"""
    return datetime.now(timezone.utc).isoformat()


def _safe_uuid(value: str | None) -> uuid.UUID | None:
    """安全解析 UUID 字符串，非法值返回 None。"""

    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


class ResourceHallService:
    """封装资源大厅列表、筛选、分页和高亮资源聚合逻辑。

    参数:
        db: 当前请求范围内的数据库会话。
        resource_serializer: 资源基础序列化函数，通常来自仓储门面。
    """

    def __init__(
        self,
        db: Session,
        *,
        resource_serializer: ResourceSerializer,
    ) -> None:
        self.db = db
        self.resource_serializer = resource_serializer

    def recommendation_service(self) -> ResourceHallRecommendationService:
        """创建推荐解释服务，隔离画像和学习事件证据读取。"""
        return ResourceHallRecommendationService(self.db)

    def course_by_slug_or_id(self, slug_or_id: str) -> Course | None:
        """按课程 slug 或 UUID 查询资源大厅上下文课程。"""

        clauses = [Course.slug == slug_or_id]
        parsed_id = _safe_uuid(slug_or_id)
        if parsed_id:
            clauses.append(Course.id == parsed_id)
        return self.db.execute(select(Course).where(or_(*clauses))).scalar_one_or_none()

    def user_by_external_id(self, external_id: str | None) -> User | None:
        """按外部用户 ID 查询当前资源大厅访问用户。"""

        if not external_id:
            return None
        return self.db.execute(select(User).where(User.external_id == external_id)).scalar_one_or_none()

    @staticmethod
    def matches_scope(item: dict[str, Any], scope: str, current_course_slug: str | None) -> bool:
        """判断大厅资源字典是否命中当前范围筛选。"""
        return matches_hall_scope(item, scope, current_course_slug)

    @staticmethod
    def is_owned_by_current_user(resource: Resource, current_user: User | None) -> bool:
        """判断资源是否属于当前用户，兼容测试中的轻量对象。"""
        return bool(current_user and resource.created_by_user_id == current_user.id)

    def matches_scope_resource(
        self,
        resource: Resource,
        *,
        community: CommunityResource | None,
        current_course: Course | None,
        current_user: User | None,
        recommended_ids: set[uuid.UUID],
        scope: str,
    ) -> bool:
        """直接基于 ORM 对象判断大厅范围，避免先把全量资源转成前端字典。"""
        normalized = (scope or "all").strip().lower()
        if normalized == "all":
            return True
        if normalized == "course":
            return bool(current_course and resource.course_id == current_course.id)
        if normalized == "general":
            return resource.course_id is None
        if normalized == "mine":
            return self.is_owned_by_current_user(resource, current_user)
        if normalized == "community":
            return (
                (
                    not self.is_owned_by_current_user(resource, current_user)
                    and is_public_hall_resource(resource, community)
                )
                or resource.status in {"published", "featured"}
            )
        if normalized == "recommended":
            return resource.id in recommended_ids
        return True

    def item_to_dict(
        self,
        resource: Resource,
        course: Course | None,
        *,
        current_course: Course | None,
        current_user: User | None,
        community: CommunityResource | None = None,
        recommended: bool = False,
    ) -> dict[str, Any]:
        """构造资源大厅专用资源卡片数据。"""
        item = self.resource_serializer(resource, course.slug if course else None)
        owned_by_current_user = bool(current_user and resource.created_by_user_id == current_user.id)
        is_public = is_public_hall_resource(resource, community)
        is_featured = is_featured_hall_resource(resource, community)
        score = hall_recommendation_score(resource, current_course=current_course, community=community)
        badges: list[str] = []
        if current_course and resource.course_id == current_course.id:
            badges.append("本课")
        if resource.course_id is None:
            badges.append("通用")
        if owned_by_current_user:
            badges.append("我的")
        if is_public:
            badges.append("社区")
        if is_featured:
            badges.append("精选")
        if len(resource.citations_json or []) > 0:
            badges.append("可溯源")

        item.update(
            {
                "scope": "course" if resource.course_id else "general",
                "owner_scope": "mine" if owned_by_current_user else "community" if is_public else None,
                "community_id": str(community.id) if community else None,
                "review_status": community.review_status if community else None,
                "submitted_at": community.created_at.isoformat() if community and community.created_at else None,
                "is_featured": is_featured,
                "is_recommended": recommended,
                "recommendation_score": score,
                "match_reason": hall_match_reason(resource, current_course=current_course, score=score),
                "recommendation_evidence": self.recommendation_service().recommendation_evidence(
                    resource,
                    current_course=current_course,
                    current_user=current_user,
                    community=community,
                    score=score,
                ),
                "badges": badges,
            }
        )
        return item

    def search_text(
        self,
        resource: Resource,
        *,
        current_course: Course | None,
        current_user: User | None,
        community: CommunityResource | None,
        score: float,
    ) -> str:
        """拼接资源大厅可搜索文本，覆盖推荐理由和推荐证据。"""
        return self.recommendation_service().search_text(
            resource,
            current_course=current_course,
            current_user=current_user,
            community=community,
            score=score,
        )

    def list_resource_hall(
        self,
        *,
        course_slug: str | None = None,
        current_user_external_id: str | None = None,
        query: str | None = None,
        scope: str = "all",
        resource_type: str | None = None,
        difficulty: str | None = None,
        page: int = 1,
        page_size: int = 12,
    ) -> dict[str, Any]:
        """返回资源大厅聚合视图，包含资源、筛选项、统计和高亮区域。"""
        current_course = self.course_by_slug_or_id(course_slug) if course_slug else None
        current_user = self.user_by_external_id(current_user_external_id)
        visible_clauses = [Resource.status.in_(("published", "featured"))]
        if current_user:
            visible_clauses.append(Resource.created_by_user_id == current_user.id)

        stmt = (
            select(Resource, Course)
            .join(Course, Course.id == Resource.course_id, isouter=True)
            .where(Resource.status != "deleted", or_(*visible_clauses))
        )
        if resource_type and resource_type != "all":
            stmt = stmt.where(Resource.resource_type == resource_type)
        if difficulty and difficulty != "all":
            stmt = stmt.where(Resource.difficulty == difficulty)

        rows = self.db.execute(stmt.order_by(Resource.updated_at.desc(), Resource.quality_score.desc())).all()
        resource_ids = [resource.id for resource, _course in rows]
        communities = (
            self.db.execute(
                select(CommunityResource)
                .where(CommunityResource.resource_id.in_(resource_ids))
                .order_by(CommunityResource.updated_at.desc(), CommunityResource.created_at.desc())
            ).scalars().all()
            if resource_ids
            else []
        )
        community_by_resource_id: dict[uuid.UUID, CommunityResource] = {}
        for community in communities:
            community_by_resource_id.setdefault(community.resource_id, community)

        scored_rows: list[HallRow] = [
            (
                hall_recommendation_score(
                    resource,
                    current_course=current_course,
                    community=community_by_resource_id.get(resource.id),
                ),
                resource,
                course,
                community_by_resource_id.get(resource.id),
            )
            for resource, course in rows
        ]
        if query and query.strip():
            keyword = query.strip().lower()
            scored_rows = [
                row
                for row in scored_rows
                if keyword
                in self.search_text(
                    row[1],
                    current_course=current_course,
                    current_user=current_user,
                    community=row[3],
                    score=row[0],
                ).lower()
            ]

        recommended_ids = {
            resource.id
            for _score, resource, _course, _community in sorted(scored_rows, key=lambda item: item[0], reverse=True)[:6]
        }
        ordered_rows = sorted(
            scored_rows,
            key=lambda item: (
                is_featured_hall_resource(item[1], item[3]),
                item[0],
                hall_sort_time(item[1]),
            ),
            reverse=True,
        )
        item_cache: dict[uuid.UUID, dict[str, Any]] = {}

        def materialize(row: HallRow) -> dict[str, Any]:
            """按需构造前端资源对象，避免列表页全量触发资源资产查询。"""
            _score, resource, course, community = row
            cached = item_cache.get(resource.id)
            if cached is not None:
                return cached
            item = self.item_to_dict(
                resource,
                course,
                current_course=current_course,
                current_user=current_user,
                community=community,
                recommended=resource.id in recommended_ids,
            )
            item_cache[resource.id] = item
            return item

        scope_counts: Counter[str] = Counter()
        type_counts: Counter[str] = Counter()
        difficulty_counts: Counter[str] = Counter()
        featured_count = 0
        citation_count = 0
        quality_total = 0
        total_views = 0
        total_copies = 0
        for _score, resource, _course, community in ordered_rows:
            owned_by_current_user = self.is_owned_by_current_user(resource, current_user)
            is_public = is_public_hall_resource(resource, community)
            if current_course and resource.course_id == current_course.id:
                scope_counts["course"] += 1
            if resource.course_id is None:
                scope_counts["general"] += 1
            if owned_by_current_user:
                scope_counts["mine"] += 1
            if is_public and not owned_by_current_user:
                scope_counts["community"] += 1
            if resource.id in recommended_ids:
                scope_counts["recommended"] += 1
            if is_featured_hall_resource(resource, community):
                featured_count += 1
            if len(resource.citations_json or []) > 0:
                citation_count += 1
            quality_total += int(resource.quality_score or 0)
            total_views += int(resource.view_count or 0)
            total_copies += int(resource.copied_count or 0)
            type_counts[str(getattr(resource, "resource_type", None) or "unknown")] += 1
            difficulty_counts[str(getattr(resource, "difficulty", None) or "unknown")] += 1

        total = len(ordered_rows)
        scoped_rows = [
            row
            for row in ordered_rows
            if self.matches_scope_resource(
                row[1],
                community=row[3],
                current_course=current_course,
                current_user=current_user,
                recommended_ids=recommended_ids,
                scope=scope,
            )
        ]
        normalized_page_size = max(6, min(int(page_size or 12), 48))
        total_items = len(scoped_rows)
        total_pages = max(1, (total_items + normalized_page_size - 1) // normalized_page_size)
        normalized_page = max(1, min(int(page or 1), total_pages))
        offset = (normalized_page - 1) * normalized_page_size
        page_rows = scoped_rows[offset:offset + normalized_page_size]
        featured_rows = [row for row in ordered_rows if is_featured_hall_resource(row[1], row[3])][:3]
        recommended_rows = [row for row in ordered_rows if row[1].id in recommended_ids][:4]
        recent_rows = sorted(ordered_rows, key=lambda row: hall_sort_time(row[1]), reverse=True)[:4]
        page_items = [materialize(row) for row in page_rows]
        stats = {
            "total": total,
            "course": scope_counts.get("course", 0),
            "general": scope_counts.get("general", 0),
            "mine": scope_counts.get("mine", 0),
            "community": scope_counts.get("community", 0),
            "recommended": scope_counts.get("recommended", 0),
            "featured": featured_count,
            "with_citations": citation_count,
            "avg_quality": round(quality_total / total) if total else 0,
            "total_views": total_views,
            "total_copies": total_copies,
        }
        scope_labels = {
            "course": "当前课程",
            "general": "通用资源",
            "mine": "我的生成",
            "community": "社区共享",
            "recommended": "画像推荐",
        }
        filters = {
            "scopes": [{"value": "all", "label": "全部资源", "count": total}, *hall_filter_options(scope_counts, scope_labels)],
            "resource_types": [{"value": "all", "label": "全部类型", "count": total}, *hall_filter_options(type_counts, TYPE_LABELS)],
            "difficulties": [{"value": "all", "label": "全部难度", "count": total}, *hall_filter_options(difficulty_counts, DIFFICULTY_LABELS)],
        }
        highlights = {
            "featured": [materialize(row) for row in featured_rows],
            "recommended": [materialize(row) for row in recommended_rows],
            "recent": [materialize(row) for row in recent_rows],
        }
        return {
            "items": page_items,
            "stats": stats,
            "filters": filters,
            "highlights": highlights,
            "pagination": {
                "page": normalized_page,
                "page_size": normalized_page_size,
                "total_items": total_items,
                "total_pages": total_pages,
                "offset": offset,
                "has_prev": normalized_page > 1,
                "has_next": normalized_page < total_pages,
            },
            "course_id": current_course.slug if current_course else course_slug,
            "query": query,
            "generated_at": _utc_iso(),
        }
