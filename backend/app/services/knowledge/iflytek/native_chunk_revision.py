"""维护 ChatDoc 原生切片修订快照的服务。"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ChatdocNativeChunkRevision, Document, DocumentChunk
from app.services.knowledge.iflytek.native_chunk_sync import NATIVE_PARSER_VERSION, ChatdocNativeChunkSync

REVISION_SOURCES = frozenset({"auto_sync", "manual_edit", "resplit", "rollback"})


class NativeChunkRevisionService:
    """管理文档原生切片的版本快照、列表和回滚。"""

    def __init__(self, db: Session) -> None:
        """初始化原生切片修订服务。

        参数:
            db: 当前数据库会话。

        返回:
            无返回值。

        副作用/失败模式:
            仅保存数据库会话引用，不立即读写数据库。
        """
        self.db = db

    def _next_revision_no(self, document_id: uuid.UUID) -> int:
        """计算指定文档的下一个修订号。

        参数:
            document_id: 目标文档 ID。

        返回:
            当前最大修订号加一；没有历史修订时返回 1。

        副作用/失败模式:
            只读取数据库；数据库查询失败会抛出 SQLAlchemy 相关异常。
        """
        current = self.db.scalar(
            select(func.max(ChatdocNativeChunkRevision.revision_no)).where(
                ChatdocNativeChunkRevision.document_id == document_id
            )
        )
        return int(current or 0) + 1

    def _collect_snapshot_rows(self, document: Document) -> list[dict]:
        """采集文档当前活跃原生切片的快照数据。

        参数:
            document: 需要生成快照的文档实体。

        返回:
            可写入 chunks_json 的切片快照列表。

        副作用/失败模式:
            只读取数据库和切片字段；数据库查询失败会抛出 SQLAlchemy 相关异常。
        """
        rows = self.db.scalars(
            select(DocumentChunk)
            .where(
                DocumentChunk.document_id == document.id,
                DocumentChunk.parser_version == NATIVE_PARSER_VERSION,
                DocumentChunk.lifecycle_status == "active",
            )
            .order_by(DocumentChunk.chunk_index)
        ).all()
        items: list[dict] = []
        for chunk in rows:
            anchor = chunk.anchor_json or {}
            tags = anchor.get("tags") if isinstance(anchor.get("tags"), list) else []
            items.append(
                {
                    "chunk_index": chunk.chunk_index,
                    "page_no": chunk.page_no,
                    "content": chunk.content,
                    "raw_text": chunk.raw_text or chunk.content,
                    "token_count": chunk.token_count,
                    "content_hash": chunk.content_hash,
                    "anchor_json": dict(anchor),
                    "tags": tags,
                    "embedding_status": chunk.embedding_status,
                }
            )
        return items

    def save_revision(
        self,
        document: Document,
        *,
        source: str,
        label: str | None = None,
        is_baseline: bool = False,
    ) -> ChatdocNativeChunkRevision:
        """保存当前原生切片状态为一条修订快照。

        参数:
            document: 需要保存快照的文档实体。
            source: 修订来源，未知来源会降级为 manual_edit。
            label: 可选的展示标签，未传入时按来源自动生成。
            is_baseline: 是否将该快照标记为基线版本。

        返回:
            新创建的 ChatdocNativeChunkRevision 实体。

        副作用/失败模式:
            会读取当前切片、创建修订记录、更新文档元数据并执行 flush。若设置基线，会先取消同文档旧基线；
            数据库写入失败会抛出 SQLAlchemy 相关异常。
        """
        if source not in REVISION_SOURCES:
            source = "manual_edit"
        snapshot = self._collect_snapshot_rows(document)
        revision_no = self._next_revision_no(document.id)
        if is_baseline:
            for row in self.db.scalars(
                select(ChatdocNativeChunkRevision).where(
                    ChatdocNativeChunkRevision.document_id == document.id,
                    ChatdocNativeChunkRevision.is_baseline.is_(True),
                )
            ):
                row.is_baseline = False
        resolved_label = label or self._default_label(source, revision_no, is_baseline)
        revision = ChatdocNativeChunkRevision(
            document_id=document.id,
            revision_no=revision_no,
            label=resolved_label,
            source=source,
            is_baseline=is_baseline,
            chunk_count=len(snapshot),
            chunks_json=snapshot,
        )
        self.db.add(revision)
        meta = {
            **(document.meta_json or {}),
            "native_chunks_active_revision_no": revision_no,
            "native_chunks_baseline_revision_no": revision_no if is_baseline else (document.meta_json or {}).get("native_chunks_baseline_revision_no"),
        }
        if is_baseline:
            meta["native_chunks_baseline_revision_no"] = revision_no
        document.meta_json = meta
        self.db.flush()
        return revision

    @staticmethod
    def _default_label(source: str, revision_no: int, is_baseline: bool) -> str:
        """根据修订来源生成默认展示标签。

        参数:
            source: 修订来源。
            revision_no: 修订号。
            is_baseline: 是否为基线快照。

        返回:
            面向管理端展示的中文标签。

        副作用/失败模式:
            纯字符串生成，无副作用。
        """
        if is_baseline:
            return f"自动切片 v{revision_no}"
        if source == "resplit":
            return f"重切后 v{revision_no}"
        if source == "rollback":
            return f"回滚 v{revision_no}"
        if source == "manual_edit":
            return f"手动调整 v{revision_no}"
        return f"快照 v{revision_no}"

    def list_revisions(self, document_id: uuid.UUID) -> list[dict]:
        """列出指定文档的原生切片修订历史。

        参数:
            document_id: 目标文档 ID。

        返回:
            按修订号倒序排列的修订摘要列表，并标记当前活跃版本和基线版本。

        副作用/失败模式:
            只读取数据库；文档不存在时仍返回历史修订列表，但活跃与基线标记为空。数据库失败会抛出
            SQLAlchemy 相关异常。
        """
        rows = self.db.scalars(
            select(ChatdocNativeChunkRevision)
            .where(ChatdocNativeChunkRevision.document_id == document_id)
            .order_by(ChatdocNativeChunkRevision.revision_no.desc())
        ).all()
        document = self.db.get(Document, document_id)
        active_no = (document.meta_json or {}).get("native_chunks_active_revision_no") if document else None
        baseline_no = (document.meta_json or {}).get("native_chunks_baseline_revision_no") if document else None
        return [
            {
                "revision_id": str(row.id),
                "revision_no": row.revision_no,
                "label": row.label,
                "source": row.source,
                "is_baseline": row.is_baseline,
                "chunk_count": row.chunk_count,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "is_active": row.revision_no == active_no,
                "is_baseline_marker": row.revision_no == baseline_no or row.is_baseline,
            }
            for row in rows
        ]

    def restore_revision(self, document: Document, revision_id: uuid.UUID) -> dict:
        """把文档原生切片回滚到指定修订快照。

        参数:
            document: 需要回滚的文档实体。
            revision_id: 目标修订 ID。

        返回:
            包含恢复统计、来源修订和新回滚修订信息的字典。

        副作用/失败模式:
            会删除当前原生切片、按快照重建切片、恢复部分向量状态、执行 flush，并保存 rollback 修订。
            修订不存在或不属于该文档时抛出 ValueError；数据库写入失败会抛出 SQLAlchemy 相关异常。
        """
        revision = self.db.get(ChatdocNativeChunkRevision, revision_id)
        if not revision or revision.document_id != document.id:
            raise ValueError("revision_not_found")
        sync = ChatdocNativeChunkSync(self.db)
        sync.clear_native_chunks(document.id)
        file_id = str((document.meta_json or {}).get("iflytek_file_id") or "")
        rows = revision.chunks_json if isinstance(revision.chunks_json, list) else []
        normalized: list[dict] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            anchor = dict(row.get("anchor_json") or {})
            if row.get("tags"):
                anchor["tags"] = row["tags"]
            normalized.append(
                {
                    "index": int(row.get("chunk_index", len(normalized))),
                    "page": row.get("page_no"),
                    "content": str(row.get("content") or ""),
                    "char_count": int(row.get("token_count") or len(str(row.get("content") or ""))),
                    "char_start": anchor.get("char_start"),
                    "char_end": anchor.get("char_end"),
                    "vendor_chunk_id": anchor.get("vendor_chunk_id"),
                    "data_type": anchor.get("data_type") or "wiki",
                    "tags": anchor.get("tags") if isinstance(anchor.get("tags"), list) else [],
                }
            )
        result = sync._upsert_rows(document, file_id, normalized)
        for chunk in self.db.scalars(
            select(DocumentChunk).where(
                DocumentChunk.document_id == document.id,
                DocumentChunk.parser_version == NATIVE_PARSER_VERSION,
            )
        ):
            emb = "ready" if (row := next((r for r in rows if r.get("chunk_index") == chunk.chunk_index), None)) and row.get("embedding_status") == "ready" else "pending"
            chunk.embedding_status = emb
        self.db.flush()
        saved = self.save_revision(document, source="rollback", label=f"回滚至 {revision.label}")
        return {
            **result,
            "restored_from_revision_id": str(revision.id),
            "restored_from_label": revision.label,
            "new_revision_id": str(saved.id),
            "new_revision_no": saved.revision_no,
        }

    def ensure_baseline_if_missing(self, document: Document) -> ChatdocNativeChunkRevision | None:
        """在文档已有原生切片但缺少基线时补建基线快照。

        参数:
            document: 需要检查的文档实体。

        返回:
            新建的基线修订；已存在基线或没有切片时返回 None。

        副作用/失败模式:
            会查询修订和切片数量，必要时创建 auto_sync 基线修订并执行 flush；数据库失败会抛出
            SQLAlchemy 相关异常。
        """
        existing = self.db.scalar(
            select(ChatdocNativeChunkRevision.id).where(
                ChatdocNativeChunkRevision.document_id == document.id,
                ChatdocNativeChunkRevision.is_baseline.is_(True),
            ).limit(1)
        )
        if existing:
            return None
        count = self.db.scalar(
            select(func.count(DocumentChunk.id)).where(
                DocumentChunk.document_id == document.id,
                DocumentChunk.parser_version == NATIVE_PARSER_VERSION,
            )
        )
        if not count:
            return None
        return self.save_revision(document, source="auto_sync", is_baseline=True)
