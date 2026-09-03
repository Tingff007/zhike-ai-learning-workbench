import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class Announcement(Base, UUIDMixin, TimestampMixin):
    """系统公告主表，承载用户侧展示与管理员发布配置。"""

    __tablename__ = "announcements"

    title: Mapped[str] = mapped_column(String(180), index=True)
    summary: Mapped[str] = mapped_column(Text(), default="")
    body: Mapped[str] = mapped_column(Text(), default="")
    category: Mapped[str] = mapped_column(String(64), default="system", index=True)
    priority: Mapped[str] = mapped_column(String(32), default="info", index=True)
    display_type: Mapped[str] = mapped_column(String(32), default="list_only", index=True)
    audience_role: Mapped[str] = mapped_column(String(32), default="all", index=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    dismissible: Mapped[bool] = mapped_column(Boolean, default=True)
    require_confirmation: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_dismiss_seconds: Mapped[int | None] = mapped_column(Integer)
    action_label: Mapped[str | None] = mapped_column(String(80))
    action_url: Mapped[str | None] = mapped_column(String(500))
    effective_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class AnnouncementRead(Base, UUIDMixin, TimestampMixin):
    """用户公告已读与强确认记录。"""

    __tablename__ = "announcement_reads"
    __table_args__ = (UniqueConstraint("announcement_id", "user_id", name="uq_announcement_read_user"),)

    announcement_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("announcements.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AnnouncementDismissal(Base, UUIDMixin, TimestampMixin):
    """用户关闭某种展示形式的公告记录。"""

    __tablename__ = "announcement_dismissals"
    __table_args__ = (UniqueConstraint("announcement_id", "user_id", "display_type", name="uq_announcement_dismissal_display"),)

    announcement_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("announcements.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    display_type: Mapped[str] = mapped_column(String(32), index=True)
