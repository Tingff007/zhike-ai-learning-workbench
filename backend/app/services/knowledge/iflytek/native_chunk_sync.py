"""同步和维护讯飞 ChatDoc 原生切片的服务。"""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import ChatdocNativeChunkRevision, Document, DocumentChunk
from app.services.knowledge.iflytek.client import IflytekChatDocError
from app.services.knowledge.iflytek.document_service import IflytekDocumentService

logger = logging.getLogger(__name__)

NATIVE_PARSER_VERSION = "iflytek_chatdoc_native"


def chunk_vector_status(
    document: Document,
    *,
    chunk_embedding_status: str | None = None,
    content_version: int | None = None,
    embedded_content_version: int | None = None,
    embedding_error: str | None = None,
) -> str:
    """把切片状态映射为前端展示用的 vector_status。

    参数:
        document: 切片所属文档，用于读取文档级向量状态。
        chunk_embedding_status: 切片当前的向量化状态。
        content_version: 切片当前内容版本。
        embedded_content_version: 已完成向量化的内容版本。
        embedding_error: 最近一次向量化错误信息。

    返回:
        前端可展示的状态值，包括 error、vectorized、edited_pending 或 pending_vectorization。

    副作用/失败模式:
        纯状态映射，无数据库写入；版本值无法转换为整数时会抛出 ValueError。
    """
    if embedding_error:
        return "error"
    emb = (chunk_embedding_status or "pending").strip().lower()
    if emb in {"failed", "error"}:
        return "error"
    if emb == "ready":
        return "vectorized"
    cv = int(content_version or 1)
    ecv = embedded_content_version
    if ecv is not None and cv > int(ecv):
        return "edited_pending"
    if ecv is None and cv > 1:
        return "edited_pending"
    return "pending_vectorization"


def should_auto_sync_native_chunks(document: Document, *, file_status: str | None = None) -> bool:
    """判断是否可以自动把 ChatDoc 原生切片同步到本地。

    参数:
        document: 待判断的文档实体。
        file_status: 可选的 ChatDoc 文件状态，未传入时从文档元数据读取。

    返回:
        已满足同步条件且尚未同步过时返回 True，否则返回 False。

    副作用/失败模式:
        仅读取文档状态与元数据，不发起网络请求，也不修改数据库。
    """
    meta = document.meta_json or {}
    if meta.get("native_chunks_synced_at"):
        return False
    status = (file_status or meta.get("chatdoc_file_status") or "").strip().lower()
    if status in {"splited", "split", "vectored", "vectorized", "ready"}:
        return True
    if document.vector_status in {"pending_activation", "ready", "indexed"}:
        return True
    return False


def mark_native_chunks_vectorized(db: Session, document: Document) -> int:
    """在 ChatDoc 向量化完成后标记本地原生切片为 ready。

    参数:
        db: 当前数据库会话。
        document: 需要同步切片向量状态的文档实体。

    返回:
        本次更新的切片数量。

    副作用/失败模式:
        会修改匹配的 DocumentChunk.embedding_status，并在有更新时执行 flush；数据库失败会抛出
        SQLAlchemy 相关异常。
    """
    rows = db.scalars(
        select(DocumentChunk).where(
            DocumentChunk.document_id == document.id,
            DocumentChunk.parser_version == NATIVE_PARSER_VERSION,
            DocumentChunk.lifecycle_status == "active",
        )
    ).all()
    updated = 0
    for chunk in rows:
        if chunk.embedding_status != "ready":
            chunk.embedding_status = "ready"
            updated += 1
    if updated:
        db.flush()
    return updated


async def maybe_auto_sync_native_chunks(
    db: Session,
    document: Document,
    file_id: str,
    *,
    file_status: str | None = None,
    service: IflytekDocumentService | None = None,
) -> dict | None:
    """在满足条件时尝试自动拉取并落库 ChatDoc 原生切片。

    参数:
        db: 当前数据库会话。
        document: 待同步的文档实体。
        file_id: ChatDoc 文件 ID，当前实现依赖文档元数据中的绑定值。
        file_status: 可选的 ChatDoc 文件状态。
        service: 可选的文档服务实例，便于测试或复用调用方客户端。

    返回:
        未达到同步条件时返回 None；同步成功时返回统计信息；同步失败时返回包含 error 的字典。

    副作用/失败模式:
        可能调用 ChatDoc file/chunks 并写入 DocumentChunk、Document.meta_json 和修订记录。捕获
        IflytekChatDocError 与 ValueError 后记录告警并返回错误信息，数据库写入异常会继续向上传递。
    """
    if not should_auto_sync_native_chunks(document, file_status=file_status):
        return None
    svc = service or IflytekDocumentService(db)
    sync = ChatdocNativeChunkSync(db, svc)
    try:
        return await sync.pull_and_persist(document)
    except (IflytekChatDocError, ValueError) as exc:
        logger.warning("ChatDoc 原生切片自动同步失败：document_id=%s error=%s", document.id, exc, exc_info=True)
        return {"error": str(exc)}


class ChatdocNativeChunkSync:
    """负责把 ChatDoc 云端原生切片同步到本地数据库。"""

    def __init__(self, db: Session, service: IflytekDocumentService | None = None) -> None:
        """初始化原生切片同步服务。

        参数:
            db: 当前数据库会话。
            service: 可选的 ChatDoc 文档服务；未传入时基于数据库会话创建。

        返回:
            无返回值。

        副作用/失败模式:
            保存数据库会话和服务实例引用；默认服务创建不会立即拉取远端数据。
        """
        self.db = db
        self.service = service or IflytekDocumentService(db)

    async def pull_and_persist(self, document: Document, *, revision_source: str = "auto_sync") -> dict:
        """从 ChatDoc 拉取文档原生切片并写入本地数据库。

        参数:
            document: 已绑定 ChatDoc fileId 的文档实体。
            revision_source: 本次同步对应的修订来源。

        返回:
            包含新增、更新、删除数量和修订信息的同步结果。

        副作用/失败模式:
            会调用 ChatDoc file/chunks，并通过 _upsert_rows 写入切片、文档元数据和修订快照。文档缺少
            fileId 时抛出 ValueError，远端调用失败会抛出 IflytekChatDocError。
        """
        file_id = str((document.meta_json or {}).get("iflytek_file_id") or "").strip()
        if not file_id:
            raise ValueError("文档未绑定 ChatDoc fileId")
        rows = await self.service.fetch_file_content(file_id)
        return self._upsert_rows(document, file_id, rows, revision_source=revision_source)

    def _upsert_rows(
        self,
        document: Document,
        file_id: str,
        rows: list[dict],
        *,
        revision_source: str = "auto_sync",
    ) -> dict:
        """将 ChatDoc 切片行合并写入本地 DocumentChunk 表。

        参数:
            document: 切片所属文档实体。
            file_id: ChatDoc 文件 ID。
            rows: 已标准化的 ChatDoc 切片列表。
            revision_source: 触发本次写入的来源。

        返回:
            包含总数、新增数、更新数、删除数、同步时间和修订信息的字典。

        副作用/失败模式:
            会新增、更新或删除 DocumentChunk，更新文档元数据，并按来源创建基线、重切或其他修订记录。
            输入行缺少 index 或字段类型不可转换时会抛出 KeyError、TypeError 或 ValueError。
        """
        now = datetime.now(timezone.utc)
        existing = {
            chunk.chunk_index: chunk
            for chunk in self.db.scalars(
                select(DocumentChunk).where(
                    DocumentChunk.document_id == document.id,
                    DocumentChunk.parser_version == NATIVE_PARSER_VERSION,
                )
            )
        }
        seen_indexes: set[int] = set()
        created = 0
        updated = 0

        for row in rows:
            index_val = int(row["index"])
            seen_indexes.add(index_val)
            content = str(row.get("content") or "")
            char_count = int(row.get("char_count") or len(content))
            tags = list(row.get("tags") or [])
            anchor = {
                "iflytek_file_id": file_id,
                "vendor_chunk_id": row.get("vendor_chunk_id"),
                "vendor_content": content,
                "char_start": row.get("char_start"),
                "char_end": row.get("char_end"),
                "data_type": row.get("data_type") or "wiki",
                "tags": tags,
            }
            content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
            chunk = existing.get(index_val)
            if chunk:
                chunk.content = content
                chunk.raw_text = content
                chunk.page_no = row.get("page")
                chunk.token_count = char_count
                chunk.anchor_json = {**(chunk.anchor_json or {}), **anchor}
                chunk.embedding_status = (
                    "ready" if document.vector_status in {"ready", "indexed"} else "pending"
                )
                chunk.content_hash = content_hash
                updated += 1
            else:
                self.db.add(
                    DocumentChunk(
                        document_id=document.id,
                        course_id=document.course_id,
                        chunk_index=index_val,
                        page_no=row.get("page"),
                        content=content,
                        raw_text=content,
                        token_count=char_count,
                        content_hash=content_hash,
                        parser_version=NATIVE_PARSER_VERSION,
                        chunker_version="chatdoc_cloud",
                        embedding_status=(
                            "ready" if document.vector_status in {"ready", "indexed"} else "pending"
                        ),
                        lifecycle_status="active",
                        anchor_json=anchor,
                    )
                )
                created += 1

        removed = 0
        for index_val, chunk in existing.items():
            if index_val not in seen_indexes:
                self.db.delete(chunk)
                removed += 1

        meta = {
            **(document.meta_json or {}),
            "chatdoc_chunk_total": len(rows),
            "native_chunks_synced_at": now.isoformat(),
            "native_chunks_source": "file/chunks",
        }
        document.meta_json = meta
        document.chunker_version = "chatdoc_cloud"
        self.db.flush()

        from app.services.knowledge.iflytek.native_chunk_revision import NativeChunkRevisionService

        rev_svc = NativeChunkRevisionService(self.db)
        has_baseline = rev_svc.db.scalar(
            select(ChatdocNativeChunkRevision.id)
            .where(
                ChatdocNativeChunkRevision.document_id == document.id,
                ChatdocNativeChunkRevision.is_baseline.is_(True),
            )
            .limit(1)
        )
        revision_meta: dict | None = None
        if revision_source == "auto_sync" and not has_baseline:
            rev = rev_svc.save_revision(document, source="auto_sync", is_baseline=True)
            revision_meta = {"revision_id": str(rev.id), "revision_no": rev.revision_no, "label": rev.label}
        elif revision_source == "resplit":
            rev = rev_svc.save_revision(document, source="resplit")
            revision_meta = {"revision_id": str(rev.id), "revision_no": rev.revision_no, "label": rev.label}

        return {
            "document_id": str(document.id),
            "file_id": file_id,
            "total": len(rows),
            "created": created,
            "updated": updated,
            "removed": removed,
            "synced_at": meta["native_chunks_synced_at"],
            "revision": revision_meta,
        }

    def list_local(
        self,
        document: Document,
        *,
        limit: int = 50,
        offset: int = 0,
        page: int | None = None,
    ) -> dict:
        """分页列出本地已同步的 ChatDoc 原生切片。

        参数:
            document: 需要查询切片的文档实体。
            limit: 返回条数上限。
            offset: 起始偏移量。
            page: 可选的页码过滤条件。

        返回:
            包含切片列表、分页参数、本地与云端数量对账信息的字典。

        副作用/失败模式:
            只读取数据库，不修改数据；数据库查询失败会抛出 SQLAlchemy 相关异常。
        """
        file_id = str((document.meta_json or {}).get("iflytek_file_id") or "")
        query = (
            select(DocumentChunk)
            .where(
                DocumentChunk.document_id == document.id,
                DocumentChunk.parser_version == NATIVE_PARSER_VERSION,
                DocumentChunk.lifecycle_status == "active",
            )
            .order_by(DocumentChunk.chunk_index)
        )
        all_rows = list(self.db.scalars(query))
        if page is not None:
            all_rows = [row for row in all_rows if row.page_no == page]
        total = len(all_rows)
        page = all_rows[offset : offset + limit]
        items = [self._serialize_chunk(document, file_id, row) for row in page]
        cloud_total = int((document.meta_json or {}).get("chatdoc_chunk_total") or 0)
        return {
            "document_id": str(document.id),
            "file_id": file_id or None,
            "vector_status": document.vector_status,
            "cloud_chunk_total": cloud_total or None,
            "local_chunk_total": total,
            "reconciliation_ok": cloud_total == total if cloud_total else None,
            "synced_at": (document.meta_json or {}).get("native_chunks_synced_at"),
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": items,
        }

    @staticmethod
    def _serialize_chunk(document: Document, file_id: str, chunk: DocumentChunk) -> dict:
        """把本地切片实体序列化为接口响应字典。

        参数:
            document: 切片所属文档，用于计算展示状态。
            file_id: 文档绑定的 ChatDoc 文件 ID。
            chunk: 待序列化的本地切片实体。

        返回:
            包含切片内容、版本、标签、定位和向量状态的字典。

        副作用/失败模式:
            仅读取实体字段，不修改数据库；字段缺失时会尽量使用空值或本地内容兜底。
        """
        anchor = chunk.anchor_json or {}
        tags = anchor.get("tags") if isinstance(anchor.get("tags"), list) else []
        vendor_id = anchor.get("vendor_chunk_id")
        vendor_content = anchor.get("vendor_content")
        if not isinstance(vendor_content, str) or not vendor_content.strip():
            vendor_content = chunk.raw_text or chunk.content
        updated_at = chunk.updated_at.isoformat() if getattr(chunk, "updated_at", None) else None
        return {
            "chunk_id": str(chunk.id),
            "file_id": file_id or anchor.get("iflytek_file_id"),
            "index": chunk.chunk_index,
            "page": chunk.page_no,
            "content": chunk.content,
            "vendor_content": vendor_content,
            "char_count": chunk.token_count or len(chunk.content or ""),
            "vector_status": chunk_vector_status(
                document,
                chunk_embedding_status=chunk.embedding_status,
                content_version=chunk.content_version,
                embedded_content_version=chunk.embedded_content_version,
                embedding_error=chunk.embedding_error,
            ),
            "content_version": chunk.content_version,
            "embedded_content_version": chunk.embedded_content_version,
            "embedding_error": chunk.embedding_error,
            "updated_at": updated_at,
            "tags": tags,
            "vendor_chunk_id": vendor_id,
            "char_start": anchor.get("char_start"),
            "char_end": anchor.get("char_end"),
            "data_type": anchor.get("data_type"),
        }

    def update_chunk(
        self,
        chunk: DocumentChunk,
        *,
        content: str | None = None,
        tags: list[str] | None = None,
        page_no: int | None = None,
    ) -> dict:
        """更新单个本地原生切片并保存修订快照。

        参数:
            chunk: 需要更新的本地切片实体。
            content: 可选的新切片内容。
            tags: 可选的新标签列表。
            page_no: 可选的新页码。

        返回:
            更新后的切片响应字典，并附带新修订信息。

        副作用/失败模式:
            会修改 DocumentChunk 内容、标签或页码，重置内容向量状态，执行 flush，并创建 manual_edit
            修订记录。找不到所属文档时抛出 ValueError。
        """
        document = self.db.get(Document, chunk.document_id)
        if not document:
            raise ValueError("document_not_found")
        if content is not None:
            anchor = dict(chunk.anchor_json or {})
            if not anchor.get("vendor_content"):
                anchor["vendor_content"] = chunk.content
            chunk.content = content.strip()
            chunk.raw_text = chunk.content
            chunk.token_count = len(chunk.content)
            chunk.content_hash = hashlib.sha256(chunk.content.encode("utf-8")).hexdigest()
            chunk.content_version = (chunk.content_version or 1) + 1
            chunk.embedding_status = "pending"
            chunk.anchor_json = anchor
        if page_no is not None:
            chunk.page_no = page_no
        if tags is not None:
            anchor = dict(chunk.anchor_json or {})
            anchor["tags"] = tags
            chunk.anchor_json = anchor
        self.db.flush()
        from app.services.knowledge.iflytek.native_chunk_revision import NativeChunkRevisionService

        rev = NativeChunkRevisionService(self.db).save_revision(document, source="manual_edit")
        file_id = str((document.meta_json or {}).get("iflytek_file_id") or "")
        item = self._serialize_chunk(document, file_id, chunk)
        item["revision"] = {"revision_id": str(rev.id), "revision_no": rev.revision_no, "label": rev.label}
        return item

    def update_chunk_by_id(
        self,
        chunk_id: str,
        *,
        content: str | None = None,
        tags: list[str] | None = None,
        page_no: int | None = None,
    ) -> dict | None:
        """按切片 ID 修订原生切片，避免 API 层直接读取 DocumentChunk 表。

        参数:
            chunk_id: 前端传入的切片 ID 字符串。
            content: 可选的新切片内容。
            tags: 可选的新标签列表。
            page_no: 可选的新页码。

        返回:
            成功时返回更新后的切片响应字典；ID 非法、切片不存在或不是 ChatDoc 原生切片时返回 None。

        副作用/失败模式:
            成功时委托 update_chunk 修改数据库实体并创建 manual_edit 修订；数据库失败会继续向上传递。
        """

        try:
            chunk_uuid = uuid.UUID(str(chunk_id))
        except (TypeError, ValueError):
            return None
        chunk = self.db.get(DocumentChunk, chunk_uuid)
        if not chunk or chunk.parser_version != NATIVE_PARSER_VERSION:
            return None
        return self.update_chunk(chunk, content=content, tags=tags, page_no=page_no)

    def clear_native_chunks(self, document_id: uuid.UUID) -> int:
        """删除指定文档的本地 ChatDoc 原生切片。

        参数:
            document_id: 目标文档 ID。

        返回:
            被删除的切片行数。

        副作用/失败模式:
            会执行数据库 delete，但不主动 commit；数据库失败会抛出 SQLAlchemy 相关异常。
        """
        result = self.db.execute(
            delete(DocumentChunk).where(
                DocumentChunk.document_id == document_id,
                DocumentChunk.parser_version == NATIVE_PARSER_VERSION,
            )
        )
        return int(result.rowcount or 0)
