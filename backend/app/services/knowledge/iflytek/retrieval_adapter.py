"""把讯飞 ChatDoc 向量检索结果适配为系统 Citation 的服务。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Course, Document
from app.schemas.common import Citation
from app.services.knowledge.iflytek.client import IflytekChatDocClient, IflytekChatDocError
from app.services.knowledge.iflytek.client_factory import chatdoc_client_for_db
from app.services.knowledge.iflytek.config_service import ChatdocConfigService
from app.services.knowledge.iflytek.pipeline_config import (
    config_with_stage_override,
    vector_search_payload_from_pipeline,
)
from app.services.knowledge.iflytek.citation_provenance import (
    enrich_citations_with_local_provenance,
    parse_chunk_index_from_row,
)
from app.services.knowledge.iflytek.file_resolver import ChatdocFileResolver

SNIPPET_PREVIEW_CHARS = 320


class IflytekRetrievalAdapter:
    """封装 ChatDoc 向量检索并补齐本地引用溯源信息。"""

    def __init__(
        self,
        db: Session,
        client: IflytekChatDocClient | None = None,
        *,
        integration_key: str | None = None,
    ) -> None:
        """初始化讯飞检索适配器。

        参数:
            db: 当前数据库会话。
            client: 可选的 ChatDoc 客户端，未传入时按集成配置创建。
            integration_key: 可选的集成模板键，用于选择检索流水线配置。

        返回:
            无返回值。

        副作用/失败模式:
            保存数据库会话和客户端引用；默认客户端创建依赖本地配置，但不会立即发起远端检索。
        """
        self.db = db
        self.integration_key = integration_key
        self.client = client or chatdoc_client_for_db(db, integration_key=integration_key)

    async def search(
        self,
        course_slug: str,
        query: str,
        concept_id: str | None = None,
        limit: int | None = None,
        document_id: str | None = None,
        retrieval_stage_body: dict | None = None,
        wiki_filter_score: float | None = None,
    ) -> tuple[list[Citation], dict]:
        """调用 ChatDoc 向量检索并转换为系统引用列表。

        参数:
            course_slug: 课程唯一标识。
            query: 用户检索文本。
            concept_id: 可选的知识点或概念过滤条件。
            limit: 可选的最大返回数量，未传入时使用系统默认 RAG 限制。
            document_id: 可选的文档过滤条件。
            retrieval_stage_body: 可选的检索阶段配置覆盖内容。
            wiki_filter_score: 可选的讯飞 wiki 过滤分数覆盖值。

        返回:
            Citation 列表和检索过滤元数据。

        副作用/失败模式:
            会读取课程、文档和检索配置，并在客户端可用时调用 ChatDoc vector/search。空查询、未配置客户端、
            课程不存在、无可检索文件或 ChatDoc 检索失败时返回空引用列表。
        """
        filter_meta: dict = {}
        if not query.strip():
            return [], filter_meta
        if not self.client.configured:
            return [], filter_meta

        course = self.db.execute(select(Course).where(Course.slug == course_slug)).scalar_one_or_none()
        if not course:
            return [], filter_meta

        resolver = ChatdocFileResolver(self.db)
        documents, filter_meta = resolver.filter_documents(
            resolver.ready_documents(course),
            course,
            concept_code=concept_id,
            document_id=document_id,
        )
        file_ids = resolver.file_ids(documents)
        if not file_ids:
            return [], filter_meta

        config_service = ChatdocConfigService(self.db)
        active_key = self.integration_key or config_service.active_template_key()
        top_n = limit or settings.RAG_RETRIEVAL_LIMIT
        pipeline = config_with_stage_override(
            config_service.pipeline_config(active_key),
            stage_id="retrieval",
            body=retrieval_stage_body,
        )
        try:
            payload = vector_search_payload_from_pipeline(
                pipeline,
                file_ids=file_ids,
                content=query,
                top_n=top_n,
                wiki_filter_score=wiki_filter_score
                if wiki_filter_score is not None
                else config_service.wiki_filter_score(active_key),
            )
            payload = await self.client.post_json("/openapi/v1/vector/search", payload)
        except IflytekChatDocError:
            return [], filter_meta

        rows = payload.get("items")
        if not isinstance(rows, list):
            rows = payload.get("results") or payload.get("chunks") or []
        if not isinstance(rows, list):
            raw = payload.get("data")
            rows = raw if isinstance(raw, list) else []

        title_by_file: dict[str, str] = {}
        for doc in documents:
            file_id = str((doc.meta_json or {}).get("iflytek_file_id") or "")
            if file_id:
                title_by_file[file_id] = doc.title or doc.filename

        citations: list[Citation] = []
        for row in rows[:top_n]:
            if not isinstance(row, dict):
                continue
            citations.append(self._map_row(row, title_by_file))
        citations = enrich_citations_with_local_provenance(self.db, course_slug, citations)
        return citations, {**filter_meta, "file_ids_count": len(file_ids), "retrieval_mode": "iflytek_vector"}

    @staticmethod
    def _map_row(row: dict, title_by_file: dict[str, str]) -> Citation:
        """把 ChatDoc 单条检索命中映射为 Citation。

        参数:
            row: ChatDoc vector/search 返回的单条命中记录。
            title_by_file: ChatDoc 文件 ID 到本地文档标题的映射。

        返回:
            系统统一使用的 Citation 对象。

        副作用/失败模式:
            不访问数据库，也不修改输入；分数无法转换为浮点数时相似度降级为 0。
        """
        content = str(row.get("content") or row.get("text") or "").strip()
        file_id = str(row.get("fileId") or row.get("file_id") or "")
        index = parse_chunk_index_from_row(row)
        chunk_id = f"iflytek:{file_id}:{index}" if file_id and index is not None else None
        score_raw = row.get("score")
        try:
            score = float(score_raw)
            similarity = score / 100.0 if score > 1 else max(0.0, min(1.0, score))
        except (TypeError, ValueError):
            similarity = 0.0
        snippet = content[:SNIPPET_PREVIEW_CHARS] if content else ""
        return Citation(
            source_id=file_id or "chatdoc",
            source_title=title_by_file.get(file_id, "课程资料"),
            page_no=None,
            iflytek_file_id=file_id or None,
            chunk_index=index,
            chunk_id=chunk_id,
            kind="chunk",
            retrieval_mode="iflytek_vector",
            similarity=similarity,
            snippet=snippet,
            content=content or None,
        )
