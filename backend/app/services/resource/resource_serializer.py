from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Course, CourseConcept, PathNode, Resource, ResourceVersion
from app.services.resource import task_metadata
from app.services.resource.asset_service import ResourceAssetService
from app.services.resource.hall_helpers import hall_match_reason, hall_recommendation_score
from app.services.resource.hall_recommendation_service import ResourceHallRecommendationService
from app.services.resource.prompts import DIFFICULTY_LABELS, TYPE_LABELS


class ResourceSerializerService:
    """负责资源实体到前端载荷的序列化，避免仓储门面承担展示字段拼装。"""

    def __init__(self, db: Session, asset_service: ResourceAssetService | None = None) -> None:
        """初始化资源序列化服务。

        参数:
            db: 当前请求或后台任务使用的数据库会话。
            asset_service: 可复用的资产服务；未传入时按当前数据库会话创建。
        """
        self.db = db
        self.asset_service = asset_service or ResourceAssetService(db)
        self.recommendation_service = ResourceHallRecommendationService(db)

    def resource_to_dict(
        self,
        resource: Resource,
        course_slug: str | None = None,
        include_content: bool = False,
    ) -> dict[str, Any]:
        """将资源实体序列化为前端资源大厅和详情页使用的字典。

        参数:
            resource: 资源 ORM 实体。
            course_slug: 已知课程 slug；为空时按资源课程 ID 查询。
            include_content: 是否携带最新版本内容。

        返回:
            前端资源卡片、详情页和资源大厅共享的资源字典。
        """

        resolved_course_slug = course_slug if course_slug is not None else self._course_slug_by_id(resource.course_id)
        quality = resource.quality_check_result or {}
        latest = self._latest_version(resource.id) if include_content else None
        concept = self.db.get(CourseConcept, resource.concept_id) if resource.concept_id else None
        path_node = self.db.get(PathNode, resource.path_node_id) if resource.path_node_id else None
        scope = "course" if resource.course_id else "general"
        basis = resource.generation_basis_json or {}
        owner_scope = "mine" if resource.created_by_user_id else None
        personalization = task_metadata.safe_personalization_summary(basis.get("personalization"))
        generation_basis_summary = personalization.get("adaptationReason") or (
            "已结合课程上下文生成" if resource.course_id else "已按通用学习主题生成"
        )
        recommendation_score = hall_recommendation_score(resource, current_course=None, community=None)
        assets = self.asset_service.assets_for_resource(resource.id)
        thumbnail = next((item.get("file_url") for item in assets if item.get("file_url")), None)
        return {
            "id": resource.code,
            "uuid": str(resource.id),
            "course_id": resolved_course_slug,
            "scope": scope,
            "owner_scope": owner_scope,
            "course_bound": bool(resource.course_id),
            "course_evidence_required": bool(basis.get("needCourseEvidence") or basis.get("need_course_evidence")),
            "concept_id": concept.code if concept else None,
            "path_node_id": path_node.code if path_node else None,
            "title": resource.title,
            "resource_type": resource.resource_type,
            "type": TYPE_LABELS.get(resource.resource_type, resource.resource_type),
            "difficulty": resource.difficulty,
            "difficulty_label": DIFFICULTY_LABELS.get(resource.difficulty, resource.difficulty),
            "status": resource.status,
            "summary": resource.summary,
            "quality": quality.get("grade", "A"),
            "refs": len(resource.citations_json or []),
            "citations": resource.citations_json or [],
            "personalization": personalization,
            "generation_basis_summary": generation_basis_summary,
            "citation_coverage": quality.get("citation_coverage"),
            "quality_score": resource.quality_score,
            "safety_status": resource.safety_status,
            "latest_version": latest.version if latest else None,
            "content": latest.content if latest else None,
            "view_count": int(resource.view_count or 0),
            "copied_count": int(resource.copied_count or 0),
            "recommendation_score": recommendation_score,
            "match_reason": hall_match_reason(resource, current_course=None, score=recommendation_score),
            "recommendation_evidence": self.recommendation_service.recommendation_evidence(
                resource,
                current_course=None,
                current_user=None,
                community=None,
                score=recommendation_score,
            ),
            "updated_at": resource.updated_at.isoformat() if resource.updated_at else None,
            "assets": assets,
            "asset_count": len(assets),
            "thumbnail_url": thumbnail,
        }

    def _course_slug_by_id(self, course_id: uuid.UUID | None) -> str | None:
        """按课程 ID 读取对外课程标识，课程缺失时回退为 UUID 字符串。"""

        if course_id is None:
            return None
        course = self.db.get(Course, course_id)
        return course.slug if course else str(course_id)

    def _latest_version(self, resource_id: uuid.UUID) -> ResourceVersion | None:
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
