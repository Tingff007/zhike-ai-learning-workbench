from uuid import uuid4
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base

class StudentLearningEvent(Base):
    __tablename__ = "student_learning_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    course_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("courses.id"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, comment="事件类型: chat/quiz/resource_view/code_run/lesson_complete")
    event_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True, comment="事件元数据")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
