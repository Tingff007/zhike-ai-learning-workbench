from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import (
    CommunityResource,
    ConceptMastery,
    Course,
    CourseProfile,
    LearningEvent,
    ProfileDimension,
    Resource,
    User,
)
from app.services.resource.hall_helpers import (
    append_recommendation_evidence,
    hall_match_reason,
    is_featured_hall_resource,
)

logger = logging.getLogger(__name__)


class ResourceHallRecommendationService:
    """封装资源大厅推荐解释、搜索文本和学习证据读取逻辑。

    参数:
        db: 当前请求范围内的数据库会话；测试中可传入轻量替身。
    """

    def __init__(self, db: Session | object) -> None:
        self.db = db

    def profile_weak_point_labels(self, *, current_course: Course | None, current_user: User | None) -> list[str]:
        """读取当前课程画像中的薄弱点标签，用于资源大厅推荐解释。"""
        if not isinstance(self.db, Session) or not current_course or not current_user:
            return []
        try:
            profile = self.db.execute(
                select(CourseProfile).where(
                    CourseProfile.course_id == current_course.id,
                    CourseProfile.user_id == current_user.id,
                )
            ).scalar_one_or_none()
            if not profile:
                return []
            rows = self.db.execute(
                select(ProfileDimension)
                .where(
                    ProfileDimension.profile_id == profile.id,
                    ProfileDimension.profile_scope == "course",
                    ProfileDimension.status == "active",
                    ProfileDimension.dimension_key.in_(("weakness", "error_pattern", "knowledge_mastery", "transfer")),
                )
                .order_by(ProfileDimension.score.asc(), ProfileDimension.updated_at.desc())
                .limit(3)
            ).scalars().all()
        except Exception:
            logger.debug(
                "读取课程画像薄弱点失败，将跳过画像推荐解释：course_id=%s user_id=%s",
                getattr(current_course, "id", None),
                getattr(current_user, "id", None),
                exc_info=True,
            )
            return []
        labels: list[str] = []
        for row in rows:
            label = str(row.label or row.dimension_name or "").strip()
            if label and label not in labels:
                labels.append(label)
        return labels[:3]

    def concept_mastery_evidence(
        self,
        resource: Resource,
        *,
        current_user: User | None,
    ) -> tuple[int, str] | None:
        """读取资源绑定知识点的掌握度短板。"""
        course_id = getattr(resource, "course_id", None)
        concept_id = getattr(resource, "concept_id", None)
        if not isinstance(self.db, Session) or not current_user or not course_id or not concept_id:
            return None
        try:
            mastery = self.db.execute(
                select(ConceptMastery).where(
                    ConceptMastery.course_id == course_id,
                    ConceptMastery.user_id == current_user.id,
                    ConceptMastery.concept_id == concept_id,
                )
            ).scalar_one_or_none()
        except Exception:
            logger.debug(
                "读取知识点掌握度推荐证据失败，将跳过该证据：resource_id=%s user_id=%s",
                getattr(resource, "id", None),
                getattr(current_user, "id", None),
                exc_info=True,
            )
            return None
        if not mastery or mastery.mastery is None or mastery.mastery > 75:
            return None
        return mastery.mastery, f"绑定知识点当前掌握度 {mastery.mastery}%，适合安排补救或复盘。"

    def recent_learning_event_evidence(
        self,
        resource: Resource,
        *,
        current_course: Course | None,
        current_user: User | None,
    ) -> str | None:
        """读取最近学习事件，说明推荐与近期学习行为的关系。"""
        resource_course_id = getattr(resource, "course_id", None)
        resource_concept_id = getattr(resource, "concept_id", None)
        course_id = resource_course_id or (current_course.id if current_course else None)
        if not isinstance(self.db, Session) or not current_user or not course_id:
            return None
        try:
            stmt = select(LearningEvent).where(
                LearningEvent.course_id == course_id,
                LearningEvent.user_id == current_user.id,
            )
            if resource_concept_id:
                stmt = stmt.where(or_(LearningEvent.concept_id == resource_concept_id, LearningEvent.concept_id.is_(None)))
            event = self.db.execute(stmt.order_by(LearningEvent.created_at.desc()).limit(1)).scalars().first()
        except Exception:
            logger.debug(
                "读取最近学习事件推荐证据失败，将跳过该证据：resource_id=%s user_id=%s course_id=%s",
                getattr(resource, "id", None),
                getattr(current_user, "id", None),
                course_id,
                exc_info=True,
            )
            return None
        if not event:
            return None
        event_labels = {
            "assessment_completed": "最近测评",
            "path_node_status_updated": "路径进度",
            "learning_schedule_completed": "日程完成",
            "learning_schedule_created": "日程编排",
            "resource_generated": "资源生成",
            "resource_reviewed": "资源审核",
        }
        label = event_labels.get(event.event_type, "学习事件")
        evidence = event.evidence_json or {}
        if isinstance(evidence, dict):
            detail = (
                evidence.get("progress_report")
                or evidence.get("summary")
                or evidence.get("feedback")
                or evidence.get("action")
                or evidence.get("status")
            )
            if detail:
                return f"{label}：{detail}"
        return f"{label}已记录，可作为推荐排序依据。"

    def recommendation_evidence(
        self,
        resource: Resource,
        *,
        current_course: Course | None,
        current_user: User | None,
        community: CommunityResource | None,
        score: float,
    ) -> list[dict]:
        """构造资源大厅可解释推荐证据。"""
        evidence: list[dict] = []
        citation_count = len(getattr(resource, "citations_json", None) or [])
        quality_score = int(getattr(resource, "quality_score", 0) or 0)
        basis = getattr(resource, "generation_basis_json", None) or {}
        personalization = basis.get("personalization") if isinstance(basis, dict) else {}
        if not isinstance(personalization, dict):
            personalization = {}

        if current_course and getattr(resource, "course_id", None) == current_course.id:
            append_recommendation_evidence(
                evidence,
                key="course_match",
                label="课程匹配",
                summary="绑定当前课程，可直接服务本课学习路径与资源复盘。",
                source="course_context",
                score=100,
            )

        weak_points = personalization.get("weakPoints")
        if isinstance(weak_points, str):
            weak_labels = [weak_points]
        elif isinstance(weak_points, list):
            weak_labels = [str(item).strip() for item in weak_points if str(item).strip()]
        else:
            weak_labels = []
        if not weak_labels:
            weak_labels = self.profile_weak_point_labels(current_course=current_course, current_user=current_user)
        if weak_labels:
            append_recommendation_evidence(
                evidence,
                key="weak_points",
                label="薄弱点",
                summary=f"聚焦 {('、'.join(weak_labels[:3]))}，适合作为定向补强资源。",
                source="learning_profile",
                score=82,
            )

        mastery_evidence = self.concept_mastery_evidence(resource, current_user=current_user)
        if mastery_evidence:
            mastery_score, summary = mastery_evidence
            append_recommendation_evidence(
                evidence,
                key="mastery_gap",
                label="掌握短板",
                summary=summary,
                source="concept_mastery",
                score=mastery_score,
            )

        adaptation_reason = personalization.get("adaptationReason")
        if adaptation_reason:
            append_recommendation_evidence(
                evidence,
                key="profile_match",
                label="画像匹配",
                summary=adaptation_reason,
                source="profile_snapshot",
                score=88,
            )

        recent_event = self.recent_learning_event_evidence(resource, current_course=current_course, current_user=current_user)
        if recent_event:
            append_recommendation_evidence(
                evidence,
                key="recent_learning",
                label="最近学习",
                summary=recent_event,
                source="learning_event",
                score=None,
            )

        if citation_count:
            append_recommendation_evidence(
                evidence,
                key="course_citation",
                label="课程资料",
                summary=f"{citation_count} 条引用可追溯，便于核验资源正文与课程资料的一致性。",
                source="citation",
                score=min(100, 60 + citation_count * 8),
            )

        if quality_score >= 85 or is_featured_hall_resource(resource, community):
            append_recommendation_evidence(
                evidence,
                key="quality",
                label="质量与复用",
                summary=f"质量分 {quality_score}，推荐分 {score:g}，可优先进入学习清单。",
                source="resource_quality",
                score=quality_score,
            )

        if not evidence:
            append_recommendation_evidence(
                evidence,
                key="ranking",
                label="综合排序",
                summary=f"根据资源质量、更新时间和当前筛选条件得到推荐分 {score:g}。",
                source="hall_ranking",
                score=int(score),
            )
        return evidence[:5]

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
        basis = getattr(resource, "generation_basis_json", None) or {}
        citations = getattr(resource, "citations_json", None) or []
        evidence = self.recommendation_evidence(
            resource,
            current_course=current_course,
            current_user=current_user,
            community=community,
            score=score,
        )
        citation_text = " ".join(
            str(item.get("snippet") or item.get("source_title") or "")
            for item in citations
            if isinstance(item, dict)
        )
        return " ".join(
            [
                str(getattr(resource, "title", "") or ""),
                str(getattr(resource, "summary", "") or ""),
                str(getattr(resource, "resource_type", "") or ""),
                str(getattr(resource, "difficulty", "") or ""),
                hall_match_reason(resource, current_course=current_course, score=score),
                json.dumps(basis, ensure_ascii=False) if isinstance(basis, dict) else str(basis),
                " ".join(f"{item.get('label', '')} {item.get('summary', '')}" for item in evidence),
                citation_text,
            ]
        )
