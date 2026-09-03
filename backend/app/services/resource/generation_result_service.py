from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.models import Course, CourseConcept, Resource, ResourceGenerationTask, ResourceVersion
from app.services.agent.cite_verifier import CiteVerifier
from app.services.resource import task_metadata
from app.services.resource.mindmap_contract import (
    MindmapContractError,
    parse_mindmap_mermaid_payload,
    validate_mermaid_mindmap_source,
)
from app.services.resource.prompts import (
    PROMPT_VERSION,
    TYPE_LABELS,
    build_personalization_metadata,
    resolve_effective_resource_type,
)
from app.services.resource.upload_service import current_utc_iso, slugify_resource_code, summarize_uploaded_content


class SlugFactory(Protocol):
    """资源 code 片段生成回调，兼容仓储门面的默认 fallback 参数。"""

    def __call__(self, value: str, fallback: str = "resource") -> str:
        """返回可用于资源 code 的短文本。"""


class ResourceGenerationResultService:
    """封装资源生成结果的质量核验、资源落库和首版保存。"""

    def __init__(
        self,
        db: Session,
        *,
        slugify: SlugFactory | None = None,
        utc_iso: Callable[[], str] | None = None,
    ) -> None:
        """初始化资源生成结果服务。

        参数:
            db: 当前请求范围内的数据库会话。
            slugify: 可选资源 code 片段生成函数，测试可注入确定性替身。
            utc_iso: 可选 UTC 时间字符串工厂，用于质量核验时间戳。
        """

        self.db = db
        self._slugify = slugify or slugify_resource_code
        self._utc_iso = utc_iso or current_utc_iso

    def quality_check(self, content: str, citations: list[dict[str, Any]]) -> dict[str, Any]:
        """对生成正文执行引用核验并汇总质量评分。"""

        result = CiteVerifier().verify(content, citations)
        mindmap_check: dict[str, Any] | None = None
        try:
            payload = parse_mindmap_mermaid_payload(content)
            mindmap_check = {"status": "passed", **validate_mermaid_mindmap_source(payload.source_code)}
        except MindmapContractError:
            mindmap_check = None
        has_citations = bool(citations)
        score = 88 if result.status == "passed" else 78 if result.status == "warning" else 68
        if not has_citations:
            score = min(score, 72)
        if len(content) > 1200 and result.status == "passed":
            score += 4
        grade = "A" if score >= 85 else "B"
        return {
            "grade": grade,
            "score": min(score, 96),
            "cite_check": result.status,
            "citation_coverage": result.citation_coverage,
            "unsupported_claims": result.unsupported_claims,
            "summary": result.summary or ("引用依据完整" if has_citations else "未命中课程引用，已标注需补充资料"),
            "checked_at": self._utc_iso(),
            **({"mindmap_check": mindmap_check} if mindmap_check else {}),
        }

    def save_generated_resource(
        self,
        course: Course | None,
        concept: CourseConcept | None,
        task: ResourceGenerationTask,
        content: str,
        citations: list[dict[str, Any]],
        quality: dict[str, Any],
        safety_status: str,
        *,
        personalization: dict[str, Any] | None = None,
        profile_context_snapshot: str | None = None,
        extra_basis: dict[str, Any] | None = None,
    ) -> Resource:
        """把生成结果保存为个人资源，并创建首个资源版本。

        参数:
            course: 可选课程实体；为空表示通用资源。
            concept: 可选课程知识点实体。
            task: 当前资源生成任务。
            content: 已生成并通过安全检查的 Markdown 正文。
            citations: 课程引用依据列表。
            quality: 引用核验和质量评分结果。
            safety_status: 安全检查状态。
            personalization: 画像个性化元数据；为空时按资源类型和难度兜底。
            profile_context_snapshot: 生成时使用的画像摘要快照。
            extra_basis: 特殊资源类型追加的生成依据，例如图片包资产信息。

        返回:
            已加入会话并刷新主键的资源实体。
        """

        concept_code = concept.code if concept else "auto"
        scope_prefix = course.slug if course else "general"
        base_code = self._slugify(f"gen-{scope_prefix}-{concept_code}-{task.resource_type}-{uuid.uuid4().hex[:8]}")
        title_source = concept.title if concept else (course.title if course else (task.goal or "通用学习主题")[:40])
        title = f"{title_source} · {TYPE_LABELS.get(task.resource_type, task.resource_type)}"
        effective_type = resolve_effective_resource_type(task.resource_type, task.goal, task.requirements)
        resource = Resource(
            course_id=course.id if course else None,
            concept_id=concept.id if concept else None,
            path_node_id=task.path_node_id,
            code=base_code,
            title=title,
            resource_type=task.resource_type,
            difficulty=task.difficulty,
            status="private",
            summary=summarize_uploaded_content(content, task.goal),
            content_uri=None,
            generation_basis_json={
                "goal": task.goal,
                "requirements": task.requirements,
                "task_id": str(task.id),
                "generationPromptVersion": PROMPT_VERSION,
                "effectiveResourceType": effective_type,
                "personalization": personalization
                or build_personalization_metadata(None, task.resource_type, task.difficulty),
                "profileContextSnapshot": profile_context_snapshot,
                "conceptId": concept.code if concept else None,
                "courseId": course.slug if course else None,
                "scope": "course" if course else "general",
                "needCourseEvidence": task_metadata.task_requires_course_evidence(task),
                **(extra_basis or {}),
            },
            citations_json=citations,
            quality_check_result=quality,
            safety_status=safety_status,
            quality_score=quality.get("score", 80),
            created_by_user_id=task.requested_by_user_id,
        )
        self.db.add(resource)
        self.db.flush()
        self.db.add(
            ResourceVersion(
                resource_id=resource.id,
                version=1,
                content=content,
                meta_json={"source": "resource_generation_task", "task_id": str(task.id), "quality": quality},
            )
        )
        self.db.flush()
        return resource
