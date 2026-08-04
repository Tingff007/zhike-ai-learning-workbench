from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import ConceptPrerequisite, Course, CourseConcept, CourseMembership, CourseSection, Document, DocumentChunk, LearningPath, ModelProvider, User, UserCurrentCourse
from app.schemas.course import CourseConceptCreateRequest, CourseConceptUpdateRequest, CourseCreateRequest, CourseOutlineApplyRequest, CourseSectionUpsertRequest, CourseUpdateRequest


class CourseRepository:
    """课程、章节、知识点和课程发布准备度的仓储服务。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def _user(self, external_id: str) -> User | None:
        return self.db.execute(select(User).where(User.external_id == external_id)).scalar_one_or_none()

    def _course(self, course_id_or_slug: str, *, include_deleted: bool = False) -> Course | None:
        clauses = [Course.slug == course_id_or_slug]
        if safe_uuid := self._safe_uuid(course_id_or_slug):
            clauses.append(Course.id == safe_uuid)
        stmt = select(Course).where(or_(*clauses))
        if not include_deleted:
            stmt = stmt.where(Course.status != "deleted")
        return self.db.execute(stmt).scalar_one_or_none()

    def get_course_model(self, course_id_or_slug: str, *, include_deleted: bool = False) -> Course | None:
        """返回课程 ORM 模型，供需要继续拼接领域查询的服务或路由使用。"""
        return self._course(course_id_or_slug, include_deleted=include_deleted)

    def _section(self, course: Course, section_code_or_id: str | None) -> CourseSection | None:
        if not section_code_or_id:
            return None
        clauses = [CourseSection.course_id == course.id, CourseSection.code == section_code_or_id]
        if safe_uuid := self._safe_uuid(section_code_or_id):
            clauses = [CourseSection.course_id == course.id, or_(CourseSection.code == section_code_or_id, CourseSection.id == safe_uuid)]
        return self.db.execute(select(CourseSection).where(*clauses)).scalar_one_or_none()

    def _concept(self, course: Course, concept_code_or_id: str | None) -> CourseConcept | None:
        if not concept_code_or_id:
            return None
        clauses = [CourseConcept.course_id == course.id, CourseConcept.code == concept_code_or_id]
        if safe_uuid := self._safe_uuid(concept_code_or_id):
            clauses = [CourseConcept.course_id == course.id, or_(CourseConcept.code == concept_code_or_id, CourseConcept.id == safe_uuid)]
        return self.db.execute(select(CourseConcept).where(*clauses)).scalar_one_or_none()

    @staticmethod
    def _safe_uuid(value: str | None) -> uuid.UUID | None:
        if not value:
            return None
        try:
            return uuid.UUID(str(value))
        except ValueError:
            return None

    @staticmethod
    def _slug_token(value: str | None) -> str:
        token = re.sub(r"[^a-zA-Z0-9]+", "_", value or "").strip("_").lower()
        return token[:80]

    def _next_course_slug(self, desired: str | None) -> str:
        base = self._slug_token(desired) or "course"
        candidate = base
        index = 1
        while self.db.execute(select(Course).where(Course.slug == candidate)).scalar_one_or_none():
            index += 1
            candidate = f"{base}_{index:02d}"
        return candidate

    def next_course_slug(self, desired: str | None) -> str:
        """生成不会与现有课程冲突的课程 slug，供课程创建服务复用。"""

        return self._next_course_slug(desired)

    def _next_scoped_code(self, course: Course, model: type[CourseSection] | type[CourseConcept], prefix: str, desired: str | None = None) -> str:
        base = self._slug_token(desired)
        if not base:
            count = self.db.execute(select(func.count(model.id)).where(model.course_id == course.id)).scalar_one()
            base = f"{prefix}_{int(count or 0) + 1:03d}"
        candidate = base
        index = 1
        while self.db.execute(select(model).where(model.course_id == course.id, model.code == candidate)).scalar_one_or_none():
            index += 1
            candidate = f"{base}_{index:02d}"
        return candidate

    def _attach_membership(self, course: Course, user_external_id: str | None) -> None:
        if not user_external_id:
            return
        user = self._user(user_external_id)
        if not user:
            return
        membership = self.db.execute(
            select(CourseMembership).where(CourseMembership.course_id == course.id, CourseMembership.user_id == user.id)
        ).scalar_one_or_none()
        if not membership:
            self.db.add(CourseMembership(course_id=course.id, user_id=user.id, role="owner", status="active"))

    def self_select_course(self, user_external_id: str, course_slug: str) -> str:
        """为当前用户自助加入课程并设置为当前课程。"""

        user = self._user(user_external_id)
        course = self._course(course_slug)
        if not user or not course:
            return course_slug
        membership = self.db.execute(
            select(CourseMembership).where(CourseMembership.course_id == course.id, CourseMembership.user_id == user.id)
        ).scalar_one_or_none()
        if membership:
            membership.status = "active"
        else:
            self.db.add(CourseMembership(course_id=course.id, user_id=user.id, role="student", status="active"))
        return self.set_current_course(user_external_id, course.slug)

    @staticmethod
    def course_to_dict(course: Course) -> dict:
        """将课程 ORM 模型转换为 API 层稳定字典。"""

        display = course.display_config or {}
        return {
            "id": course.slug,
            "title": course.title,
            "description": course.description,
            "status": course.status,
            "applicable_major": course.applicable_major,
            "display_config": display,
            "deleted_at": display.get("deleted_at"),
        }

    def list_courses(self, user_external_id: str | None = None) -> list[dict]:
        """列出学生可见课程，可按用户成员关系过滤。"""

        stmt = select(Course).where(Course.status == "published").order_by(Course.is_default.desc(), Course.title)
        if user_external_id:
            user = self._user(user_external_id)
            if user:
                stmt = (
                    select(Course)
                    .join(CourseMembership, CourseMembership.course_id == Course.id)
                    .where(
                        CourseMembership.user_id == user.id,
                        CourseMembership.status == "active",
                        Course.status != "deleted",
                    )
                    .order_by(Course.is_default.desc(), Course.title)
                )
        return [self.course_to_dict(course) for course in self.db.execute(stmt).scalars().all()]

    def list_admin_courses(self) -> list[dict]:
        """列出管理端可维护的未删除课程。"""

        stmt = (
            select(Course)
            .where(Course.status != "deleted")
            .order_by(Course.is_default.desc(), Course.status, Course.title)
        )
        return [self.course_to_dict(course) for course in self.db.execute(stmt).scalars().all()]

    def list_deleted_courses(self) -> list[dict]:
        """列出管理端回收站中的软删除课程。"""

        stmt = select(Course).where(Course.status == "deleted").order_by(Course.updated_at.desc())
        return [self.course_to_dict(course) for course in self.db.execute(stmt).scalars().all()]

    def _reassign_default_course(self) -> None:
        replacement = self.db.execute(
            select(Course).where(Course.status == "published").order_by(Course.title).limit(1)
        ).scalar_one_or_none()
        if replacement:
            replacement.is_default = True
            self.db.commit()

    def get_course(self, course_id_or_slug: str) -> dict | None:
        """按 slug 或 UUID 获取课程 API 字典。"""

        course = self._course(course_id_or_slug)
        return self.course_to_dict(course) if course else None

    @staticmethod
    def section_to_dict(section: CourseSection, concepts: list[dict] | None = None) -> dict:
        """将章节 ORM 模型转换为课程大纲响应字典。"""

        return {
            "id": section.code,
            "course_id": str(section.course_id),
            "title": section.title,
            "description": section.description,
            "order_index": section.order_index,
            "concepts": concepts or [],
        }

    @staticmethod
    def concept_to_dict(concept: CourseConcept, course: Course, section: CourseSection | None = None, prerequisites: list[str] | None = None) -> dict:
        """将知识点 ORM 模型转换为课程大纲响应字典。"""

        return {
            "id": concept.code,
            "course_id": course.slug,
            "title": concept.title,
            "definition": concept.definition,
            "section_id": section.code if section else None,
            "section_title": section.title if section else "未分章",
            "difficulty": concept.difficulty,
            "recommended_order": concept.recommended_order,
            "prerequisites": prerequisites if prerequisites is not None else concept.prerequisites_json or [],
            "status": concept.status,
        }

    def _prerequisite_codes(self, concept: CourseConcept) -> list[str]:
        rows = self.db.execute(
            select(CourseConcept.code)
            .join(ConceptPrerequisite, ConceptPrerequisite.prerequisite_id == CourseConcept.id)
            .where(ConceptPrerequisite.concept_id == concept.id)
            .order_by(CourseConcept.recommended_order)
        ).scalars().all()
        return list(rows) if rows else list(concept.prerequisites_json or [])

    def _sync_concept_prerequisites(self, course: Course, concept: CourseConcept, prerequisite_codes: list[str]) -> None:
        self.db.query(ConceptPrerequisite).filter(ConceptPrerequisite.concept_id == concept.id).delete()
        if not prerequisite_codes:
            concept.prerequisites_json = []
            return
        prerequisites = self.db.execute(
            select(CourseConcept).where(CourseConcept.course_id == course.id, CourseConcept.code.in_(prerequisite_codes))
        ).scalars().all()
        by_code = {item.code: item for item in prerequisites}
        normalized_codes = [code for code in prerequisite_codes if code in by_code and code != concept.code]
        concept.prerequisites_json = normalized_codes
        for code in normalized_codes:
            self.db.add(
                ConceptPrerequisite(
                    course_id=course.id,
                    concept_id=concept.id,
                    prerequisite_id=by_code[code].id,
                    dependency_type="strong",
                )
            )

    def course_readiness(self, course_slug: str) -> dict | None:
        """计算课程发布前准备度，返回阻塞项和下一步建议。"""

        course = self._course(course_slug)
        if not course:
            return None

        sections = self.db.execute(select(CourseSection).where(CourseSection.course_id == course.id)).scalars().all()
        concepts = self.db.execute(select(CourseConcept).where(CourseConcept.course_id == course.id)).scalars().all()
        published_concepts = [item for item in concepts if item.status == "published"]
        concept_codes = {item.code for item in concepts}
        invalid_prerequisites = sorted(
            {
                prerequisite
                for concept in concepts
                for prerequisite in (concept.prerequisites_json or [])
                if prerequisite not in concept_codes or prerequisite == concept.code
            }
        )
        document_total = self.db.execute(select(func.count(Document.id)).where(Document.course_id == course.id)).scalar_one()
        chunk_total = self.db.execute(select(func.count(DocumentChunk.id)).where(DocumentChunk.course_id == course.id)).scalar_one()
        embedding_ready = self.db.execute(
            select(func.count(Document.id)).where(Document.course_id == course.id, Document.vector_status.in_(["ready", "indexed"]))
        ).scalar_one()
        failed_tasks = self.db.execute(
            select(func.count(Document.id)).where(
                Document.course_id == course.id,
                or_(Document.parse_status == "failed", Document.vector_status == "failed"),
            )
        ).scalar_one()
        active_model = self.db.execute(
            select(func.count(ModelProvider.id)).where(ModelProvider.is_active.is_(True))
        ).scalar_one()

        def check(
            key: str,
            label: str,
            passed: bool,
            detail: str,
            action_label: str,
            action_href: str,
            *,
            blocking: bool = True,
        ) -> dict:
            """构造统一的课程发布检查项。"""

            return {
                "key": key,
                "label": label,
                "status": "ok" if passed else "blocked" if blocking else "warning",
                "blocking": bool(blocking and not passed),
                "detail": detail,
                "action_label": action_label,
                "action_href": action_href,
            }

        checks = [
            check(
                "basic_info",
                "课程基本信息",
                bool(course.title and course.description),
                "标题和课程说明用于学生端解释推荐原因。",
                "完善课程信息",
                "/admin/course-builder",
            ),
            check(
                "sections",
                "章节结构",
                len(sections) > 0,
                f"当前 {len(sections)} 个章节。",
                "维护章节",
                "/admin/course-builder",
            ),
            check(
                "concepts",
                "知识点图谱",
                len(published_concepts) >= 5,
                f"已发布 {len(published_concepts)} 个知识点，建议 MVP 主课不少于 5 个。",
                "补充知识点",
                "/admin/course-builder",
            ),
            check(
                "prerequisites",
                "前置依赖",
                not invalid_prerequisites,
                "发现无效前置依赖：" + "、".join(invalid_prerequisites) if invalid_prerequisites else "前置依赖均可解析。",
                "修正依赖",
                "/admin/course-builder",
            ),
            check(
                "documents",
                "课程资料入库",
                int(document_total or 0) > 0,
                f"已入库 {int(document_total or 0)} 份资料。",
                "上传资料",
                "/admin/knowledge-base",
            ),
            check(
                "chunks",
                "解析切片",
                int(chunk_total or 0) > 0 and int(failed_tasks or 0) == 0,
                f"切片 {int(chunk_total or 0)} 条，失败任务 {int(failed_tasks or 0)} 个。",
                "查看切片",
                "/admin/knowledge-base",
            ),
            check(
                "embedding",
                "向量检索",
                int(embedding_ready or 0) > 0,
                f"Embedding ready 文档 {int(embedding_ready or 0)} 份。",
                "重建向量",
                "/admin/knowledge-base",
            ),
            check(
                "rubric",
                "评估 Rubric",
                True,
                "练习评估会回写 assessment、mastery、profile evidence 和 path remediation。",
                "查看评估",
                "/assessment",
                blocking=False,
            ),
            check(
                "resource_templates",
                "资源模板",
                True,
                "讲义、题库、PPT、实验、视频脚本和拓展阅读模板已接入资源工坊。",
                "生成资源",
                "/resource-workshop",
                blocking=False,
            ),
            check(
                "model_strategy",
                "模型策略",
                int(active_model or 0) > 0 or bool(course.model_config_json),
                f"可用模型供应商 {int(active_model or 0)} 个。",
                "配置模型",
                "/admin/model-gateway",
                blocking=False,
            ),
        ]
        blocked = [item for item in checks if item["blocking"]]
        score = round(sum(1 for item in checks if item["status"] == "ok") / len(checks) * 100)
        return {
            "ready": not blocked,
            "score": score,
            "checks": checks,
            "blocking": [item["label"] for item in blocked],
            "next_action": blocked[0]["action_label"] if blocked else "允许发布",
        }

    def get_course_builder_outline(self, course_slug: str) -> dict | None:
        """返回课程构建器所需的大纲、资料统计和切片绑定数据。"""

        course = self._course(course_slug)
        if not course:
            return None
        active_document_ids = {
            str(document_id)
            for document_id in self.db.execute(select(Document.id).where(Document.course_id == course.id)).scalars().all()
        }

        def visible_outline_item(item: CourseSection | CourseConcept) -> bool:
            """判断自动生成的大纲项是否仍然关联有效资料。"""

            meta = item.meta_json or {}
            if not meta.get("auto_generated"):
                return True
            source_document_id = meta.get("source_document_id")
            return bool(source_document_id and str(source_document_id) in active_document_ids)

        sections = self.db.execute(
            select(CourseSection).where(CourseSection.course_id == course.id).order_by(CourseSection.order_index, CourseSection.created_at)
        ).scalars().all()
        sections = [section for section in sections if visible_outline_item(section)]
        concept_rows = self.db.execute(
            select(CourseConcept, CourseSection)
            .outerjoin(CourseSection, CourseSection.id == CourseConcept.section_id)
            .where(CourseConcept.course_id == course.id)
            .order_by(CourseConcept.recommended_order, CourseConcept.created_at)
        ).all()
        concept_rows = [(concept, section) for concept, section in concept_rows if visible_outline_item(concept)]
        concepts_by_section: dict[uuid.UUID, list[dict]] = {section.id: [] for section in sections}
        unsectioned: list[dict] = []
        for concept, section in concept_rows:
            item = self.concept_to_dict(concept, course, section, self._prerequisite_codes(concept))
            if section:
                concepts_by_section.setdefault(section.id, []).append(item)
            else:
                unsectioned.append(item)

        document_total = self.db.execute(select(func.count(Document.id)).where(Document.course_id == course.id)).scalar_one()
        chunk_total = self.db.execute(select(func.count(DocumentChunk.id)).where(DocumentChunk.course_id == course.id)).scalar_one()
        embedding_ready = self.db.execute(
            select(func.count(Document.id)).where(Document.course_id == course.id, Document.vector_status.in_(["ready", "indexed"]))
        ).scalar_one()
        failed_tasks = self.db.execute(
            select(func.count(Document.id)).where(
                Document.course_id == course.id,
                or_(Document.parse_status == "failed", Document.vector_status == "failed"),
            )
        ).scalar_one()
        chunk_rows = self.db.execute(
            select(DocumentChunk, Document, CourseConcept)
            .join(Document, Document.id == DocumentChunk.document_id)
            .outerjoin(CourseConcept, CourseConcept.id == DocumentChunk.concept_id)
            .where(DocumentChunk.course_id == course.id)
            .order_by(DocumentChunk.chunk_index)
        ).all()
        chunk_preview = sorted(chunk_rows, key=lambda row: (float(row[0].quality_score or 0), row[0].created_at), reverse=True)[:8]
        return {
            "course": self.course_to_dict(course),
            "sections": [self.section_to_dict(section, concepts_by_section.get(section.id, [])) for section in sections],
            "unsectioned_concepts": unsectioned,
            "document_stats": {
                "document_total": int(document_total or 0),
                "chunk_total": int(chunk_total or 0),
                "embedding_ready": int(embedding_ready or 0),
                "failed_tasks": int(failed_tasks or 0),
            },
            "chunk_preview": [
                {
                    "chunk_id": str(chunk.id),
                    "source_title": document.title,
                    "page_no": chunk.page_no,
                    "section_path": chunk.section_path,
                    "asset_type": chunk.asset_type,
                    "heading_path": chunk.heading_path_json or [],
                    "heading_number": chunk.heading_number,
                    "content": chunk.content[:600],
                    "quality": round(float(chunk.quality_score or 0), 2),
                }
                for chunk, document, _concept in chunk_preview
            ],
            "asset_bindings": [
                {
                    "binding_id": str(chunk.id),
                    "chunk_id": str(chunk.id),
                    "document_id": str(document.id),
                    "page_asset_id": str(chunk.page_asset_id) if chunk.page_asset_id else None,
                    "element_id": concept.code if concept else None,
                    "source_title": document.title,
                    "source_filename": document.filename,
                    "page_no": chunk.page_no,
                    "section_path": chunk.section_path,
                    "asset_type": chunk.asset_type,
                    "heading_path": chunk.heading_path_json or [],
                    "heading_path_text": chunk.heading_path_text,
                    "heading_number": chunk.heading_number,
                    "content": chunk.content[:800],
                    "quality": round(float(chunk.quality_score or 0), 2),
                    "token_count": chunk.token_count,
                    "reading_order_index": chunk.reading_order_index,
                    "embedding_status": "INDEXED" if chunk.embedding_model else "PENDING",
                    "similarity": round(float(chunk.quality_score or 0), 2),
                }
                for chunk, document, concept in chunk_rows
            ],
            "readiness": self.course_readiness(course.slug),
        }

    def create_course(self, payload: CourseCreateRequest, user_external_id: str | None = None) -> dict:
        """创建课程并在需要时绑定创建者为课程拥有者。"""

        if payload.slug and self.db.execute(select(Course).where(Course.slug == payload.slug)).scalar_one_or_none():
            raise ValueError("course slug already exists")
        if payload.is_default:
            self.db.query(Course).update({Course.is_default: False})
        course = Course(
            slug=payload.slug or self._next_course_slug(payload.title),
            title=payload.title,
            description=payload.description,
            cover_url=payload.cover_url,
            applicable_major=payload.applicable_major,
            status=payload.status,
            is_default=payload.is_default,
            display_config=payload.display_config,
        )
        self.db.add(course)
        self.db.flush()
        self._attach_membership(course, user_external_id)
        self.db.commit()
        self.db.refresh(course)
        return self.course_to_dict(course)

    def update_course(self, course_slug: str, payload: CourseUpdateRequest) -> dict | None:
        """更新课程信息，发布前会执行准备度阻塞校验。"""

        course = self._course(course_slug)
        if not course:
            return None
        updates = payload.model_dump(exclude_unset=True)
        if updates.get("status") == "published" and course.status != "published":
            readiness = self.course_readiness(course.slug)
            if readiness and not readiness["ready"]:
                blocking = "、".join(readiness.get("blocking") or [])
                raise ValueError(f"课程发布前检查未通过：{blocking}")
        if updates.get("is_default") is True:
            self.db.query(Course).filter(Course.id != course.id).update({Course.is_default: False})
        for field, value in updates.items():
            setattr(course, field, value)
        self.db.commit()
        self.db.refresh(course)
        return self.course_to_dict(course)

    def delete_course(self, course_slug: str) -> bool:
        """软删除课程，并在默认课程被删除时自动重选默认课程。"""

        course = self._course(course_slug, include_deleted=True)
        if not course or course.status == "deleted":
            return False
        was_default = course.is_default
        display = dict(course.display_config or {})
        display["previous_status"] = course.status
        display["deleted_at"] = datetime.now(UTC).isoformat()
        course.display_config = display
        course.status = "deleted"
        if was_default:
            course.is_default = False
        self.db.commit()
        if was_default:
            self._reassign_default_course()
        return True

    def restore_course(self, course_slug: str) -> dict | None:
        """从课程回收站恢复软删除课程。"""

        course = self._course(course_slug, include_deleted=True)
        if not course or course.status != "deleted":
            return None
        display = dict(course.display_config or {})
        previous_status = display.pop("previous_status", None) or "draft"
        display.pop("deleted_at", None)
        course.display_config = display
        course.status = previous_status if previous_status != "deleted" else "draft"
        self.db.commit()
        self.db.refresh(course)
        return self.course_to_dict(course)

    async def purge_course(self, course_slug: str, *, sync_chatdoc: bool = True) -> dict | None:
        """永久删除已软删除课程，并清理其有效和回收站文档。"""
        course = self._course(course_slug, include_deleted=True)
        if not course or course.status != "deleted":
            return None

        from app.services.knowledge.repository import KnowledgeRepository

        knowledge = KnowledgeRepository(self.db)
        documents = self.db.execute(
            select(Document).where(Document.course_id == course.id, Document.deleted_at.is_(None))
        ).scalars().all()
        documents_purged: list[str] = []
        for document in documents:
            result = await knowledge.purge_document(str(document.id), sync_chatdoc=sync_chatdoc)
            if result:
                documents_purged.append(str(document.id))

        was_default = course.is_default
        payload = {
            "status": "purged",
            "course_id": str(course.id),
            "slug": course.slug,
            "title": course.title,
            "documents_purged": documents_purged,
        }
        self.db.delete(course)
        self.db.commit()
        if was_default:
            self._reassign_default_course()
        return payload

    def delete_section(self, course_slug: str, section_code: str) -> bool:
        """删除课程章节，调用方负责处理章节下知识点的业务影响。"""

        course = self._course(course_slug)
        if not course:
            return False
        section = self._section(course, section_code)
        if not section:
            return False
        self.db.delete(section)
        self.db.commit()
        return True

    def upsert_section(self, course_slug: str, payload: CourseSectionUpsertRequest, section_code: str | None = None) -> dict | None:
        """创建或更新课程章节并返回章节响应字典。"""

        course = self._course(course_slug)
        if not course:
            return None
        section = self._section(course, section_code or payload.code)
        if section is None:
            order_index = payload.order_index
            if order_index is None:
                current_max = self.db.execute(select(func.max(CourseSection.order_index)).where(CourseSection.course_id == course.id)).scalar_one()
                order_index = int(current_max or 0) + 1
            section = CourseSection(
                course_id=course.id,
                code=self._next_scoped_code(course, CourseSection, "section", payload.code or payload.title),
                title=payload.title,
                description=payload.description,
                order_index=order_index,
            )
            self.db.add(section)
        else:
            section.title = payload.title
            section.description = payload.description
            if payload.order_index is not None:
                section.order_index = payload.order_index
        self.db.commit()
        self.db.refresh(section)
        return self.section_to_dict(section)

    def _resolve_section_for_concept(
        self,
        course: Course,
        section_code: str | None,
        section_title: str | None,
    ) -> CourseSection | None:
        section = self._section(course, section_code)
        if section or not section_title:
            return section
        section = self.db.execute(
            select(CourseSection).where(CourseSection.course_id == course.id, CourseSection.title == section_title)
        ).scalar_one_or_none()
        if section:
            return section
        current_max = self.db.execute(select(func.max(CourseSection.order_index)).where(CourseSection.course_id == course.id)).scalar_one()
        section = CourseSection(
            course_id=course.id,
            code=self._next_scoped_code(course, CourseSection, "section", section_title),
            title=section_title,
            order_index=int(current_max or 0) + 1,
        )
        self.db.add(section)
        self.db.flush()
        return section

    def create_concept(self, course_slug: str, payload: CourseConceptCreateRequest) -> dict | None:
        """创建课程知识点并同步前置依赖关系。"""

        course = self._course(course_slug)
        if not course:
            return None
        if payload.code and self._concept(course, payload.code):
            raise ValueError("concept code already exists")
        section = self._resolve_section_for_concept(course, payload.section_code, payload.section_title)
        recommended_order = payload.recommended_order
        if recommended_order is None:
            current_max = self.db.execute(select(func.max(CourseConcept.recommended_order)).where(CourseConcept.course_id == course.id)).scalar_one()
            recommended_order = int(current_max or 0) + 1
        concept = CourseConcept(
            course_id=course.id,
            section_id=section.id if section else None,
            code=payload.code or self._next_scoped_code(course, CourseConcept, "concept", payload.title),
            title=payload.title,
            definition=payload.definition,
            difficulty=payload.difficulty,
            recommended_order=recommended_order,
            prerequisites_json=payload.prerequisites,
            status=payload.status,
        )
        self.db.add(concept)
        self.db.flush()
        self._sync_concept_prerequisites(course, concept, payload.prerequisites)
        self.db.commit()
        self.db.refresh(concept)
        return self.concept_to_dict(concept, course, section, self._prerequisite_codes(concept))

    def update_concept(self, course_slug: str, concept_code: str, payload: CourseConceptUpdateRequest) -> dict | None:
        """更新课程知识点、所属章节和前置依赖关系。"""

        course = self._course(course_slug)
        if not course:
            return None
        concept = self._concept(course, concept_code)
        if not concept:
            return None
        updates = payload.model_dump(exclude_unset=True)
        if "section_code" in updates or "section_title" in updates:
            section = self._resolve_section_for_concept(course, payload.section_code, payload.section_title)
            concept.section_id = section.id if section else None
        else:
            section = concept.section
        field_map = {
            "title": "title",
            "definition": "definition",
            "difficulty": "difficulty",
            "recommended_order": "recommended_order",
            "status": "status",
        }
        for source, target in field_map.items():
            if source in updates:
                setattr(concept, target, updates[source])
        if "prerequisites" in updates:
            self._sync_concept_prerequisites(course, concept, updates["prerequisites"])
        self.db.commit()
        self.db.refresh(concept)
        return self.concept_to_dict(concept, course, section or concept.section, self._prerequisite_codes(concept))

    def apply_outline_draft(self, course_slug: str, payload: CourseOutlineApplyRequest) -> dict | None:
        """将导入或 AI 生成的大纲草稿应用到课程结构。"""

        course = self._course(course_slug)
        if not course:
            return None

        if payload.course_title is not None:
            course.title = payload.course_title
        if payload.course_description is not None:
            course.description = payload.course_description

        if payload.mode == "replace":
            self._backup_course_outline(course)
            self.db.query(ConceptPrerequisite).filter(ConceptPrerequisite.course_id == course.id).delete(synchronize_session=False)
            self.db.query(CourseConcept).filter(CourseConcept.course_id == course.id).delete(synchronize_session=False)
            self.db.query(CourseSection).filter(CourseSection.course_id == course.id).delete(synchronize_session=False)
            self.db.flush()

        self._archive_active_paths(course)

        section_by_input_code: dict[str, CourseSection] = {}
        created_sections = 0
        updated_sections = 0
        created_concepts = 0
        updated_concepts = 0

        for section_draft in sorted((item for item in payload.sections if item.include), key=lambda item: item.order_index):
            existing = self._section(course, section_draft.code)
            if existing is None:
                section = CourseSection(
                    course_id=course.id,
                    code=self._next_scoped_code(course, CourseSection, "section", section_draft.code or section_draft.title),
                    title=section_draft.title,
                    description=section_draft.description,
                    order_index=section_draft.order_index,
                )
                self.db.add(section)
                self.db.flush()
                created_sections += 1
            else:
                section = existing
                section.title = section_draft.title
                section.description = section_draft.description
                section.order_index = section_draft.order_index
                updated_sections += 1
            if section_draft.code:
                section_by_input_code[section_draft.code] = section

        concept_rows: list[tuple[CourseConcept, list[str]]] = []
        for section_draft in sorted((item for item in payload.sections if item.include), key=lambda item: item.order_index):
            section = section_by_input_code.get(section_draft.code or "")
            if not section:
                section = self._section(course, section_draft.code)
            for concept_draft in sorted((item for item in section_draft.concepts if item.include), key=lambda item: item.recommended_order):
                existing = self._concept(course, concept_draft.code)
                if existing is None:
                    concept = CourseConcept(
                        course_id=course.id,
                        section_id=section.id if section else None,
                        code=self._next_scoped_code(course, CourseConcept, "concept", concept_draft.code or concept_draft.title),
                        title=concept_draft.title,
                        definition=concept_draft.definition,
                        difficulty=concept_draft.difficulty,
                        recommended_order=concept_draft.recommended_order,
                        prerequisites_json=[],
                        status=concept_draft.status,
                    )
                    self.db.add(concept)
                    self.db.flush()
                    created_concepts += 1
                else:
                    concept = existing
                    concept.section_id = section.id if section else None
                    concept.title = concept_draft.title
                    concept.definition = concept_draft.definition
                    concept.difficulty = concept_draft.difficulty
                    concept.recommended_order = concept_draft.recommended_order
                    concept.status = concept_draft.status
                    updated_concepts += 1
                concept_rows.append((concept, concept_draft.prerequisites if payload.rebuild_prerequisites else []))

        if payload.rebuild_prerequisites:
            for concept, prerequisites in concept_rows:
                self._sync_concept_prerequisites(course, concept, prerequisites)

        self.db.commit()
        return {
            "status": "applied",
            "mode": payload.mode,
            "course": self.course_to_dict(course),
            "sections_created": created_sections,
            "sections_updated": updated_sections,
            "concepts_created": created_concepts,
            "concepts_updated": updated_concepts,
            "backup_created": payload.mode == "replace",
            "paths_archived": True,
        }

    def _backup_course_outline(self, course: Course) -> None:
        sections = self.db.execute(
            select(CourseSection).where(CourseSection.course_id == course.id).order_by(CourseSection.order_index)
        ).scalars().all()
        concepts = self.db.execute(
            select(CourseConcept).where(CourseConcept.course_id == course.id).order_by(CourseConcept.recommended_order)
        ).scalars().all()
        section_code_by_id = {section.id: section.code for section in sections}
        backup = {
            "created_at": datetime.now(UTC).isoformat(),
            "reason": "outline_replace",
            "sections": [
                {
                    "code": section.code,
                    "title": section.title,
                    "description": section.description,
                    "order_index": section.order_index,
                }
                for section in sections
            ],
            "concepts": [
                {
                    "code": concept.code,
                    "title": concept.title,
                    "definition": concept.definition,
                    "difficulty": concept.difficulty,
                    "recommended_order": concept.recommended_order,
                    "status": concept.status,
                    "section_code": section_code_by_id.get(concept.section_id),
                    "prerequisites": self._prerequisite_codes(concept),
                }
                for concept in concepts
            ],
        }
        display_config = dict(course.display_config or {})
        backups = list(display_config.get("outline_backups") or [])
        backups.append(backup)
        display_config["outline_backups"] = backups[-5:]
        course.display_config = display_config

    def _archive_active_paths(self, course: Course) -> None:
        active_paths = self.db.execute(
            select(LearningPath).where(LearningPath.course_id == course.id, LearningPath.status == "active")
        ).scalars().all()
        for path in active_paths:
            path.status = "archived"

    def get_current_course(self, user_external_id: str) -> str | None:
        """读取用户当前选中的课程 slug。"""

        user = self._user(user_external_id)
        if not user:
            return None
        row = self.db.execute(
            select(UserCurrentCourse, Course)
            .join(Course, Course.id == UserCurrentCourse.course_id)
            .where(UserCurrentCourse.user_id == user.id)
        ).first()
        if row:
            return row[1].slug
        return None

    def set_current_course(self, user_external_id: str, course_slug: str) -> str:
        """设置用户当前课程；课程或用户不存在时返回原始课程标识。"""

        user = self._user(user_external_id)
        course = self._course(course_slug)
        if not user or not course:
            return course_slug
        current = self.db.execute(select(UserCurrentCourse).where(UserCurrentCourse.user_id == user.id)).scalar_one_or_none()
        if current:
            current.course_id = course.id
        else:
            self.db.add(UserCurrentCourse(user_id=user.id, course_id=course.id))
        self.db.commit()
        return course.slug

    def list_sections(self, course_slug: str) -> list[dict]:
        """列出课程章节。"""

        course = self._course(course_slug)
        if not course:
            return []
        sections = self.db.execute(
            select(CourseSection)
            .where(CourseSection.course_id == course.id)
            .order_by(CourseSection.order_index, CourseSection.created_at)
        ).scalars().all()
        return [self.section_to_dict(section) for section in sections]

    def list_concepts(self, course_slug: str) -> list[dict]:
        """列出课程已发布知识点。"""

        course = self._course(course_slug)
        if not course:
            return []
        rows = self.db.execute(
            select(CourseConcept, CourseSection)
            .outerjoin(CourseSection, CourseSection.id == CourseConcept.section_id)
            .where(CourseConcept.course_id == course.id, CourseConcept.status == "published")
            .order_by(CourseConcept.recommended_order)
        ).all()
        return [
            {
                "id": concept.code,
                "course_id": course.slug,
                "title": concept.title,
                "definition": concept.definition,
                "section_id": section.code if section else None,
                "section_title": section.title if section else "未分章",
                "difficulty": concept.difficulty,
                "recommended_order": concept.recommended_order,
                "prerequisites": self._prerequisite_codes(concept),
                "status": concept.status,
            }
            for concept, section in rows
        ]

    def list_concepts_outline(self, course_slug: str) -> dict:
        """返回课程知识点和章节组合大纲。"""

        return {
            "items": self.list_concepts(course_slug),
            "sections": self.list_sections(course_slug),
        }
