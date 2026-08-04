from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class ChatdocNativeChunkRevision(Base, UUIDMixin, TimestampMixin):
    """ChatDoc 原生切片的时间点快照，用于回滚。"""

    __tablename__ = "chatdoc_native_chunk_revisions"
    __table_args__ = (UniqueConstraint("document_id", "revision_no", name="uq_native_chunk_revision_no"),)

    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    revision_no: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="auto_sync", nullable=False)
    is_baseline: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    chunks_json: Mapped[list] = mapped_column(JSONB, default=list)
