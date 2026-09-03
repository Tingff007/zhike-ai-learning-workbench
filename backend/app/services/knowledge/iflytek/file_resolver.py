from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Course, CourseConcept, Document, DocumentChunk
from app.services.knowledge.repository import KnowledgeRepository


class ChatdocFileResolver:
    """按课程文档解析 ChatDoc fileId，并支持可选知识点/文档过滤。

    用途:
        为检索、问答和向量搜索流程提供可用文档集合及其 ChatDoc fileId。

    副作用/失败:
        方法会读取数据库和文档元数据；数据库异常由 SQLAlchemy 向上抛出。
    """

    def __init__(self, db: Session) -> None:
        """初始化 ChatDoc 文件解析器。

        参数:
            db: SQLAlchemy 会话，用于查询课程文档和知识点绑定关系。

        返回:
            None。

        副作用/失败:
            创建 KnowledgeRepository 实例，不主动查询数据库。
        """
        self.db = db
        self.repository = KnowledgeRepository(db)

    def ready_documents(self, course: Course) -> list[Document]:
        """查询课程下已完成向量化的有效文档。

        参数:
            course: 课程 ORM 对象。

        返回:
            未删除且 vector_status 为 ready 的 Document 列表。

        副作用/失败:
            只读取数据库，不修改状态；数据库查询失败时抛出 SQLAlchemy 异常。
        """
        return list(
            self.db.execute(
                select(Document).where(
                    Document.course_id == course.id,
                    Document.deleted_at.is_(None),
                    Document.vector_status == "ready",
                )
            ).scalars().all()
        )

    def filter_documents(
        self,
        documents: list[Document],
        course: Course,
        *,
        concept_code: str | None = None,
        document_id: str | None = None,
    ) -> tuple[list[Document], dict]:
        """按文档 ID 和知识点过滤候选文档。

        参数:
            documents: 待过滤的文档列表。
            course: 文档所属课程 ORM 对象。
            concept_code: 可选知识点编码。
            document_id: 可选文档 ID 字符串。

        返回:
            二元组，第一项为过滤后的文档列表，第二项为过滤元信息字典。

        副作用/失败:
            可能读取知识点和切片绑定关系；无匹配时返回带原因的元信息，不主动抛出业务异常。
        """
        meta = {
            "concept_id": concept_code,
            "document_id": document_id,
            "concept_filter_applied": False,
            "concept_bound_document_count": 0,
        }
        document_uuid = self.repository.parse_uuid(document_id)
        if document_id and not document_uuid:
            return [], {**meta, "filter_reason": "invalid_document_id"}

        filtered = documents
        if document_uuid:
            filtered = [doc for doc in filtered if doc.id == document_uuid]

        if concept_code:
            concept = self.repository.get_course_concept_model(course, concept_code)
            if not concept:
                return filtered, {**meta, "filter_reason": "concept_not_found", "concept_filter_skipped": True}
            bound_ids = self._document_ids_bound_to_concept(course.id, concept.id)
            meta["concept_filter_applied"] = True
            meta["concept_bound_document_count"] = len(bound_ids)
            concept_filtered = [
                doc
                for doc in filtered
                if doc.id in bound_ids or self._document_matches_concept_fallback(doc, concept)
            ]
            if concept_filtered:
                filtered = concept_filtered
            else:
                meta["filter_reason"] = "no_documents_for_concept"
                meta["concept_filter_fallback"] = True

        return filtered, meta

    def file_ids(self, documents: list[Document]) -> list[str]:
        """从文档元数据中提取 ChatDoc fileId。

        参数:
            documents: 已筛选的文档列表。

        返回:
            非空 iflytek_file_id 字符串列表，保持输入文档顺序。

        副作用/失败:
            只读取内存中的文档对象，不访问数据库；缺少元数据的文档会被跳过。
        """
        ids: list[str] = []
        for doc in documents:
            file_id = str((doc.meta_json or {}).get("iflytek_file_id") or "").strip()
            if file_id:
                ids.append(file_id)
        return ids

    def _document_ids_bound_to_concept(self, course_id: uuid.UUID, concept_id: uuid.UUID) -> set[uuid.UUID]:
        rows = self.db.execute(
            select(DocumentChunk.document_id)
            .where(
                DocumentChunk.course_id == course_id,
                DocumentChunk.concept_id == concept_id,
            )
            .distinct()
        ).scalars().all()
        return {row for row in rows if row}

    @staticmethod
    def _document_matches_concept_fallback(document: Document, concept: CourseConcept) -> bool:
        if document.chapter_code and document.chapter_code == concept.code:
            return True
        meta = document.meta_json or {}
        raw_codes = meta.get("concept_codes") or meta.get("bound_concept_codes") or meta.get("concept_ids") or []
        if isinstance(raw_codes, str):
            raw_codes = [raw_codes]
        if not isinstance(raw_codes, list):
            return False
        normalized = {str(code) for code in raw_codes}
        return concept.code in normalized or str(concept.id) in normalized
