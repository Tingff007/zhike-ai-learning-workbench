import uuid
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class Conversation(Base, UUIDMixin, TimestampMixin):
    """记录用户围绕课程开展的一段 AI 学习对话会话。"""

    __tablename__ = "conversations"

    course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="课程对话")
    status: Mapped[str] = mapped_column(String(32), default="active")
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class Message(Base, UUIDMixin, TimestampMixin):
    """记录对话会话中的单条用户或 AI 消息内容。"""

    __tablename__ = "messages"

    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(32))
    content: Mapped[str] = mapped_column(Text())
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class MessageCitation(Base, UUIDMixin, TimestampMixin):
    """记录消息引用的知识来源片段，支撑答案溯源与证据展示。"""

    __tablename__ = "message_citations"

    message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    document_chunk_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("document_chunks.id", ondelete="SET NULL"), index=True)
    source_title: Mapped[str] = mapped_column(String(255))
    page_no: Mapped[int | None] = mapped_column(Integer)
    similarity: Mapped[float] = mapped_column(default=0.0)
    snippet: Mapped[str] = mapped_column(Text())


class AgentTraceEvent(Base, UUIDMixin, TimestampMixin):
    """记录智能体处理对话时的步骤状态和调试追踪信息。"""

    __tablename__ = "agent_trace_events"

    conversation_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    message_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    step: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(32))
    detail: Mapped[str | None] = mapped_column(Text())
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    payload_json: Mapped[dict] = mapped_column(JSONB, default=dict)
