from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Protocol

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import ContentReviewLog, Course, CourseConcept, CommunityResource, Resource, User
from app.schemas.resource import ResourceReviewRequest
from app.services.learning.events import LearningEventRecorder


REVIEW_ACTION_TRANSITIONS = {
    "approve": ("approved", "published"),
    "feature": ("featured", "featured"),
    "request_changes": ("changes_requested", "changes_requested"),
    "reject": ("rejected", "hidden"),
    "hide": ("hidden", "hidden"),
    "archive": ("archived", "archived"),
}

REVIEW_ACTION_DEFAULT_COMMENTS = {
    "approve": "审核通过，资源已进入可复用资源池。",
    "feature": "审核通过并标记为精选资源。",
    "request_changes": "请根据审核意见补充或修订后再次提交。",
    "reject": "资源未通过审核，请按规范重新生成或修改。",
    "hide": "资源已被管理员隐藏。",
    "archive": "资源审核记录已归档。",
}


class ResourceSerializer(Protocol):
    """资源审核服务使用的资源序列化回调。"""

    def __call__(
        self,
        resource: Resource,
        course_slug: str | None = None,
        include_content: bool = False,
    ) -> dict:
        """将资源实体转换为接口返回字典。"""


def _utc_iso() -> str:
    """返回当前 UTC 时间的 ISO 字符串。"""
    return datetime.now(timezone.utc).isoformat()


def _safe_uuid(value: str | None) -> uuid.UUID | None:
    """安全解析 UUID 字符串，无法解析时返回 None。"""
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def _course_identity_clause(course_slug: str) -> Any:
    """按课程 slug 或 UUID 构造筛选条件。"""
    clauses = [Course.slug == course_slug]
    course_uuid = _safe_uuid(course_slug)
    if course_uuid:
        clauses.append(Course.id == course_uuid)
    return or_(*clauses)


def _resource_identity_clause(resource_code: str) -> Any:
    """按资源 code 或 UUID 构造筛选条件。"""
    clauses = [Resource.code == resource_code]
    resource_uuid = _safe_uuid(resource_code)
    if resource_uuid:
        clauses.append(Resource.id == resource_uuid)
    return or_(*clauses)


def _parse_iso_datetime(value: Any) -> datetime | None:
    """将审核结果中的 ISO 时间转为 datetime，格式不合法时返回 None。"""
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _review_comment(action: str, raw_comment: str | None) -> str:
    """生成最终审核意见，保证每一次审核动作都有可展示的意见。"""
    comment = (raw_comment or "").strip()
    if comment:
        return comment
    return REVIEW_ACTION_DEFAULT_COMMENTS.get(action, "管理员已完成资源审核。")


class ResourceReviewService:
    """封装资源审核队列、详情、统计、日志和审核动作。"""

    def __init__(self, db: Session, *, resource_serializer: ResourceSerializer) -> None:
        """初始化资源审核服务。

        参数:
            db: 当前请求或任务使用的数据库会话。
            resource_serializer: 资源字典序列化回调，用于复用仓储既有返回结构。
        """
        self.db = db
        self.resource_serializer = resource_serializer

    def _user(self, external_id: str | None) -> User | None:
        """按外部用户 ID 查询审核人。"""
        if not external_id:
            return None
        return self.db.execute(select(User).where(User.external_id == external_id)).scalar_one_or_none()

    def _resource_by_code(self, resource_code: str, *, include_deleted: bool = False) -> Resource | None:
        """按资源 code 或 UUID 查询资源，默认排除已删除资源。"""
        stmt = select(Resource).where(_resource_identity_clause(resource_code))
        if not include_deleted:
            stmt = stmt.where(Resource.status != "deleted")
        return self.db.execute(stmt.order_by(Resource.updated_at.desc(), Resource.created_at.desc()).limit(1)).scalars().first()

    def community_for_resource(self, resource_id: uuid.UUID) -> CommunityResource | None:
        """读取资源最新的一条社区审核记录，兼容历史重复记录。"""
        return (
            self.db.execute(
                select(CommunityResource)
                .where(CommunityResource.resource_id == resource_id)
                .order_by(CommunityResource.updated_at.desc(), CommunityResource.created_at.desc())
                .limit(1)
            )
            .scalars()
            .first()
        )

    def review_item_to_dict(self, community: CommunityResource, include_content: bool = False) -> dict:
        """将社区审核记录转换为审核队列和详情接口使用的字典。"""
        resource = self.db.get(Resource, community.resource_id)
        course = self.db.get(Course, community.course_id) if community.course_id else None
        if not resource:
            return {}
        item = self.resource_serializer(resource, course.slug if course else None, include_content=include_content)
        concept = self.db.get(CourseConcept, resource.concept_id) if resource.concept_id else None
        submitter = self.db.get(User, community.submitted_by_user_id) if community.submitted_by_user_id else None
        reviewer = self.db.get(User, community.reviewed_by_user_id) if community.reviewed_by_user_id else None
        review_result = community.review_result_json or {}
        item.update(
            {
                "community_id": str(community.id),
                "review_status": community.review_status,
                "review_result": review_result,
                "status": resource.status,
                "concept_title": concept.title if concept else None,
                "submitted_by": submitter.display_name if submitter else None,
                "reviewed_by": reviewer.display_name if reviewer else None,
                "submitted_at": community.created_at.isoformat() if community.created_at else None,
                "reviewed_at": review_result.get("reviewed_at"),
                "review_comment": review_result.get("comment"),
            }
        )
        return item

    def list_review_queue(
        self,
        course_slug: str | None = None,
        review_status: str | None = None,
        limit: int = 80,
    ) -> list[dict]:
        """列出资源审核队列，支持按课程和审核状态筛选。"""
        stmt = select(CommunityResource).join(Course, Course.id == CommunityResource.course_id, isouter=True)
        if course_slug:
            stmt = stmt.where(_course_identity_clause(course_slug))
        if review_status and review_status != "all":
            stmt = stmt.where(CommunityResource.review_status == review_status)
        status_rank = {
            "pending_review": 0,
            "changes_requested": 1,
            "approved": 2,
            "featured": 3,
            "rejected": 4,
            "hidden": 5,
            "archived": 6,
        }
        rows = (
            self.db.execute(stmt.order_by(CommunityResource.updated_at.desc(), CommunityResource.created_at.desc()).limit(limit))
            .scalars()
            .all()
        )
        items = [self.review_item_to_dict(row) for row in rows]
        items = [item for item in items if item]
        return sorted(
            items,
            key=lambda item: (status_rank.get(item.get("review_status") or "", 9), -(item.get("quality_score") or 0)),
        )

    def get_review_item(self, resource_code: str) -> dict | None:
        """读取单个资源的审核详情，缺少社区审核记录时按旧行为自动补建。"""
        resource = self._resource_by_code(resource_code)
        if not resource:
            return None
        community = self.community_for_resource(resource.id)
        if not community:
            community = CommunityResource(
                resource_id=resource.id,
                course_id=resource.course_id,
                submitted_by_user_id=resource.created_by_user_id,
                review_status=resource.status
                if resource.status in {"pending_review", "featured", "hidden", "archived"}
                else "pending_review",
                review_result_json={},
            )
            self.db.add(community)
            self.db.commit()
            self.db.refresh(community)
        return self.review_item_to_dict(community, include_content=True)

    def review_stats(self, course_slug: str | None = None) -> dict:
        """统计资源审核看板指标。"""
        rows = self.list_review_queue(course_slug=course_slug, review_status="all", limit=500)
        today = datetime.now(timezone.utc).date()

        def has_missing_citation(item: dict) -> bool:
            """判断审核项是否缺少引用或引用质量不足。"""
            quality = item.get("review_result") or {}
            quality_check = item.get("quality")
            return (item.get("refs") or 0) == 0 or quality.get("citation_complete") is False or quality_check == "C"

        def was_approved_today(item: dict) -> bool:
            """判断审核项是否在今天通过或精选。"""
            if item.get("review_status") not in {"approved", "featured"}:
                return False
            reviewed_at = _parse_iso_datetime(item.get("reviewed_at"))
            if reviewed_at is None:
                return False
            if reviewed_at.tzinfo is None:
                reviewed_at = reviewed_at.replace(tzinfo=timezone.utc)
            return reviewed_at.astimezone(timezone.utc).date() == today

        return {
            "pending_review": sum(1 for item in rows if item.get("review_status") == "pending_review"),
            "changes_requested": sum(1 for item in rows if item.get("review_status") == "changes_requested"),
            "approved_today": sum(1 for item in rows if was_approved_today(item)),
            "featured": sum(1 for item in rows if item.get("review_status") == "featured" or item.get("status") == "featured"),
            "citation_missing": sum(1 for item in rows if has_missing_citation(item)),
            "safety_blocked": sum(
                1
                for item in rows
                if item.get("safety_status") not in {None, "passed"} or item.get("review_status") in {"rejected", "hidden"}
            ),
        }

    def list_review_logs(
        self,
        course_slug: str | None = None,
        resource_code: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """列出资源审核日志，支持按课程或资源筛选。"""
        stmt = (
            select(ContentReviewLog, Resource, User)
            .join(Resource, Resource.id == ContentReviewLog.resource_id, isouter=True)
            .join(Course, Course.id == Resource.course_id, isouter=True)
            .join(User, User.id == ContentReviewLog.reviewer_id, isouter=True)
        )
        if course_slug:
            stmt = stmt.where(_course_identity_clause(course_slug))
        if resource_code:
            stmt = stmt.where(_resource_identity_clause(resource_code))

        rows = self.db.execute(stmt.order_by(ContentReviewLog.created_at.desc()).limit(max(1, min(200, limit)))).all()
        items: list[dict] = []
        for log, resource, reviewer in rows:
            result = log.result_json or {}
            items.append(
                {
                    "id": str(log.id),
                    "resource_id": resource.code if resource else str(log.resource_id),
                    "resource_uuid": str(log.resource_id) if log.resource_id else None,
                    "title": resource.title if resource else "资源已删除",
                    "action": log.action,
                    "note": log.note,
                    "reviewer": reviewer.display_name if reviewer else None,
                    "review_status": result.get("review_status"),
                    "resource_status": result.get("resource_status"),
                    "quality_score": result.get("quality_score"),
                    "citation_complete": result.get("citation_complete"),
                    "safety_status": result.get("safety_status"),
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                }
            )
        return items

    def review_resource(
        self,
        resource_code: str,
        payload: ResourceReviewRequest,
        reviewer_external_id: str | None = None,
    ) -> dict | None:
        """执行资源审核动作并写入审核日志和学习事件。"""
        resource = self._resource_by_code(resource_code)
        if not resource:
            return None
        reviewer = self._user(reviewer_external_id)
        community = self.community_for_resource(resource.id)
        if not community:
            community = CommunityResource(
                resource_id=resource.id,
                course_id=resource.course_id,
                submitted_by_user_id=resource.created_by_user_id,
                review_status="pending_review",
                review_result_json={},
            )
            self.db.add(community)
            self.db.flush()

        action = payload.action.strip().lower()
        if action not in REVIEW_ACTION_TRANSITIONS:
            raise ValueError(f"不支持的审核动作：{payload.action}")
        review_status, resource_status = REVIEW_ACTION_TRANSITIONS[action]
        reviewed_at = _utc_iso()
        comment = _review_comment(action, payload.comment)

        if payload.title is not None and payload.title.strip():
            resource.title = payload.title.strip()
        if payload.summary is not None and payload.summary.strip():
            resource.summary = payload.summary.strip()
        if payload.difficulty is not None and payload.difficulty.strip():
            resource.difficulty = payload.difficulty.strip()
        if payload.quality_score is not None:
            resource.quality_score = max(0, min(100, payload.quality_score))

        merged_quality = dict(resource.quality_check_result or {})
        if payload.quality_grade:
            merged_quality["grade"] = payload.quality_grade
        if payload.quality_score is not None:
            merged_quality["score"] = resource.quality_score
        merged_quality["review_action"] = action
        merged_quality["reviewed_at"] = reviewed_at
        resource.quality_check_result = merged_quality
        resource.status = resource_status

        review_result = dict(community.review_result_json or {})
        review_result.update(
            {
                "action": action,
                "status": review_status,
                "comment": comment,
                "quality_score": resource.quality_score,
                "quality_grade": payload.quality_grade or merged_quality.get("grade"),
                "tags": payload.tags,
                "citation_complete": bool(resource.citations_json),
                "safety_status": resource.safety_status,
                "reviewed_at": reviewed_at,
            }
        )
        community.review_status = review_status
        community.review_result_json = review_result
        community.reviewed_by_user_id = reviewer.id if reviewer else None
        self.db.add(
            ContentReviewLog(
                resource_id=resource.id,
                reviewer_id=reviewer.id if reviewer else None,
                action=action,
                note=comment,
                result_json={
                    "review_status": review_status,
                    "resource_status": resource_status,
                    "quality_score": resource.quality_score,
                    "quality_grade": review_result.get("quality_grade"),
                    "citation_complete": bool(resource.citations_json),
                    "safety_status": resource.safety_status,
                    "reviewed_at": reviewed_at,
                },
            )
        )
        if resource.course_id:
            LearningEventRecorder(self.db).record(
                course_id=resource.course_id,
                user_id=resource.created_by_user_id,
                concept_id=resource.concept_id,
                event_type="resource_reviewed",
                source_type="resource_review",
                source_id=resource.code,
                evidence={
                    "action": action,
                    "review_status": review_status,
                    "resource_status": resource_status,
                    "quality_score": resource.quality_score,
                    "citation_complete": bool(resource.citations_json),
                    "safety_status": resource.safety_status,
                    "reviewer_user_id": str(reviewer.id) if reviewer else None,
                    "next_actions": ["publish_to_hall"] if review_status in {"approved", "featured"} else ["return_to_author"],
                },
            )
        self.db.commit()
        self.db.refresh(community)
        return self.review_item_to_dict(community, include_content=True)
