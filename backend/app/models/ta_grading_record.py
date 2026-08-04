from uuid import uuid4
from datetime import datetime, timezone
from sqlalchemy import String, Text, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base

class TaGradingRecord(Base):
    __tablename__ = "ta_grading_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    title: Mapped[str] = mapped_column(String(300), nullable=False, comment="作业/题目标题")
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    course_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("courses.id"), nullable=True)
    class_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("ta_classes.id"), nullable=True)
    grader_type: Mapped[str] = mapped_column(String(20), default="ai_assisted", comment="批改方式: auto/ai_assisted/manual")
    question_type: Mapped[str | None] = mapped_column(String(30), nullable=True, comment="题目类型")
    score: Mapped[float | None] = mapped_column(Float, nullable=True, comment="得分")
    total_score: Mapped[float | None] = mapped_column(Float, nullable=True, comment="满分")
    feedback: Mapped[dict | None] = mapped_column(JSONB, nullable=True, comment="批改反馈")
    ai_comment: Mapped[str | None] = mapped_column(Text, nullable=True, comment="AI评语")
    ta_comment: Mapped[str | None] = mapped_column(Text, nullable=True, comment="助教补充")
    status: Mapped[str] = mapped_column(String(20), default="pending", comment="状态: pending/graded/returned")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
