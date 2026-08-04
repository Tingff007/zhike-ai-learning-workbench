from uuid import uuid4
from datetime import datetime, timezone
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base

class TaClass(Base):
    __tablename__ = "ta_classes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False, comment="班级名称")
    description: Mapped[str | None] = mapped_column(Text, nullable=True, comment="班级描述")
    course_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("courses.id"), nullable=True, comment="关联课程")
    ta_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, comment="助教/教师用户ID")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否启用")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    students = relationship("TaClassStudent", back_populates="class_ref", lazy="selectin")
