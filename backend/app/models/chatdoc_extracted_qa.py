from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ChatdocExtractedQa(Base, TimestampMixin):
    """ChatDoc /qa/extract/result 的本地影子表，供前端免费读取。"""

    __tablename__ = "chatdoc_extracted_qa"
    __table_args__ = (
        UniqueConstraint("document_id", "vendor_qa_id", name="uq_chatdoc_extracted_qa_doc_vendor"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), index=True)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id"), index=True)
    iflytek_file_id: Mapped[str] = mapped_column(String(128), index=True)
    vendor_qa_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text, default="")
