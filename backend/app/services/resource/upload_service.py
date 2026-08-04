from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import CommunityResource, Course, CourseConcept, PathNode, Resource, ResourceVersion, User
from app.services.learning.events import LearningEventRecorder
from app.services.resource.prompts import DIFFICULTY_LABELS, TYPE_LABELS


SlugFactory = Callable[[str, str], str]
UtcIsoFactory = Callable[[], str]


def slugify_resource_code(value: str, fallback: str = "resource") -> str:
    """将标题或主题压缩为适合资源 code 使用的短 slug。"""

    text = re.sub(r"[^a-zA-Z0-9_\-]+", "-", value.strip().lower()).strip("-")
    return text[:60] or fallback


def current_utc_iso() -> str:
    """返回当前 UTC 时间的 ISO 字符串，供资源服务统一写入元数据。"""

    return datetime.now(timezone.utc).isoformat()


def summarize_uploaded_content(content: str, fallback: str) -> str:
    """从用户上传正文中提取短摘要，正文为空时返回业务兜底文案。"""

    plain = re.sub(r"[#*`>\-]+", " ", content).strip()
    plain = re.sub(r"\s+", " ", plain)
    return (plain[:120] + "…") if len(plain) > 120 else (plain or fallback)


class UploadedResourceService:
    """封装用户手动上传资源的创建、版本记录、审核提交和学习事件写入。"""

    def __init__(
        self,
        db: Session,
        *,
        slugify: SlugFactory = slugify_resource_code,
        utc_iso: UtcIsoFactory = current_utc_iso,
    ) -> None:
        """初始化上传资源服务。

        参数:
            db: 当前请求范围内的数据库会话。
            slugify: 资源 code 片段生成函数，测试可注入固定替身。
            utc_iso: 统一 UTC 时间字符串工厂，测试可注入固定替身。
        """

        self.db = db
        self._slugify = slugify
        self._utc_iso = utc_iso

    def create_uploaded_resource(
        self,
        *,
        title: str,
        summary: str | None,
        content: str,
        resource_type: str,
        difficulty: str,
        course: Course | None = None,
        concept: CourseConcept | None = None,
        path_node: PathNode | None = None,
        user: User | None = None,
        source_filename: str | None = None,
        submit_for_review: bool = False,
    ) -> Resource:
        """创建用户上传资源，并同步首个版本、可选审核记录和学习事件。

        参数:
            title: 资源标题。
            summary: 用户填写的摘要，空值时从正文生成。
            content: Markdown/TXT 正文内容。
            resource_type: 资源类型枚举，非法值会回退为 reading。
            difficulty: 难度枚举，非法值会回退为 basic。
            course: 已解析课程；为空表示通用资源。
            concept: 已解析知识点；仅课程资源可用。
            path_node: 已解析学习路径节点。
            user: 当前上传用户；匿名或系统上传时可为空。
            source_filename: 上传文件名；粘贴正文时为空。
            submit_for_review: 是否创建后直接提交资源大厅审核。

        返回:
            已持久化并刷新的资源实体。
        """

        uploaded_at = self._utc_iso()
        code_seed = self._slugify(title, "uploaded-resource")[:42]
        resource_code = f"upload-{code_seed}-{uuid.uuid4().hex[:8]}"
        normalized_type = resource_type if resource_type in TYPE_LABELS else "reading"
        normalized_difficulty = difficulty if difficulty in DIFFICULTY_LABELS else "basic"
        summary_text = summary or summarize_uploaded_content(content, f"{title} 的上传资源")
        status = "pending_review" if submit_for_review else "private"
        quality = self._manual_upload_quality()
        resource = Resource(
            course_id=course.id if course else None,
            concept_id=concept.id if concept else None,
            path_node_id=path_node.id if path_node else None,
            code=resource_code,
            title=title[:255],
            resource_type=normalized_type,
            difficulty=normalized_difficulty,
            status=status,
            summary=summary_text,
            content_uri=None,
            generation_basis_json={
                "source": "manual_upload",
                "sourceFilename": source_filename,
                "scope": "course" if course else "general",
                "courseId": course.slug if course else None,
                "conceptId": concept.code if concept else None,
                "pathNodeId": path_node.code if path_node else None,
                "uploadedAt": uploaded_at,
                "submitForReview": submit_for_review,
            },
            citations_json=[],
            quality_check_result=quality,
            safety_status="passed",
            quality_score=72,
            created_by_user_id=user.id if user else None,
        )
        self.db.add(resource)
        self.db.flush()
        self.db.add(
            ResourceVersion(
                resource_id=resource.id,
                version=1,
                content=content,
                meta_json={
                    "source": "manual_upload",
                    "source_filename": source_filename,
                    "uploaded_at": uploaded_at,
                    "quality": quality,
                },
            )
        )
        if submit_for_review:
            self._add_review_record(resource, course, user, uploaded_at)
        if course:
            self._record_learning_event(resource, course, concept, user, source_filename, submit_for_review)
        self.db.commit()
        self.db.refresh(resource)
        return resource

    @staticmethod
    def _manual_upload_quality() -> dict[str, object]:
        """构造手动上传资源的初始质量快照，供审核和版本元数据复用。"""

        return {
            "grade": "B",
            "score": 72,
            "source": "manual_upload",
            "citation_coverage": "manual_upload",
        }

    def _add_review_record(
        self,
        resource: Resource,
        course: Course | None,
        user: User | None,
        uploaded_at: str,
    ) -> None:
        """为选择提交审核的上传资源创建资源大厅待审记录。"""

        self.db.add(
            CommunityResource(
                resource_id=resource.id,
                course_id=course.id if course else None,
                submitted_by_user_id=user.id if user else None,
                review_status="pending_review",
                review_result_json={
                    "submitted_reason": "用户上传后直接提交资源大厅审核。",
                    "source": "manual_upload",
                    "submitted_at": uploaded_at,
                },
            )
        )

    def _record_learning_event(
        self,
        resource: Resource,
        course: Course,
        concept: CourseConcept | None,
        user: User | None,
        source_filename: str | None,
        submit_for_review: bool,
    ) -> None:
        """写入课程资源上传学习事件，帮助画像和资源闭环后续消费。"""

        LearningEventRecorder(self.db).record(
            course_id=course.id,
            user_id=user.id if user else None,
            concept_id=concept.id if concept else None,
            event_type="resource_uploaded",
            source_type="resource",
            source_id=resource.code,
            evidence={
                "resource_type": resource.resource_type,
                "difficulty": resource.difficulty,
                "source_filename": source_filename,
                "status": resource.status,
                "next_actions": ["edit_version", "submit_review"] if not submit_for_review else ["admin_review"],
            },
        )
