from uuid import uuid4
from datetime import datetime, timezone
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base

class TaAlertRecord(Base):
    __tablename__ = "ta_alert_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    class_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("ta_classes.id"), nullable=True)
    course_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("courses.id"), nullable=True)
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False, comment="预警类型: score_drop/inactive/mastery_gap")
    severity: Mapped[str] = mapped_column(String(10), default="medium", comment="严重程度: low/medium/high")
    title: Mapped[str] = mapped_column(String(200), nullable=False, comment="预警标题")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
