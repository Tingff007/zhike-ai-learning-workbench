import uuid
from sqlalchemy import Boolean, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Role(Base, UUIDMixin, TimestampMixin):
    """记录平台角色定义，用于区分用户权限和业务身份。"""

    __tablename__ = "roles"

    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text())


class User(Base, UUIDMixin, TimestampMixin):
    """记录平台用户账号及其基础身份、登录和状态信息。"""

    __tablename__ = "users"

    external_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    role_code: Mapped[str] = mapped_column(String(64), default="student")
    status: Mapped[str] = mapped_column(String(32), default="active")


class UserSetting(Base, UUIDMixin, TimestampMixin):
    """记录用户学习偏好、默认课程和隐私策略配置。"""

    __tablename__ = "user_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    default_course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"))
    learning_goals: Mapped[list[str]] = mapped_column(JSONB, default=list)
    learning_cadence: Mapped[str] = mapped_column(String(64), default="每周 5 天")
    resource_preferences: Mapped[list[str]] = mapped_column(JSONB, default=list)
    personal_model_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    privacy_policy: Mapped[dict] = mapped_column(JSONB, default=dict)


class Session(Base, UUIDMixin, TimestampMixin):
    """记录用户刷新令牌会话，用于登录续期和撤销控制。"""

    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(255))
    user_agent: Mapped[str | None] = mapped_column(Text())
    ip_hash: Mapped[str | None] = mapped_column(String(255))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class CourseMembership(Base, UUIDMixin, TimestampMixin):
    """记录用户在课程中的成员身份和课程内角色。"""

    __tablename__ = "course_memberships"
    __table_args__ = (UniqueConstraint("course_id", "user_id", name="uq_course_membership"),)

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(32), default="student")
    status: Mapped[str] = mapped_column(String(32), default="active")


class UserCurrentCourse(Base, UUIDMixin, TimestampMixin):
    """记录用户当前选择的课程，支持工作区恢复默认上下文。"""

    __tablename__ = "user_current_courses"
    __table_args__ = (UniqueConstraint("user_id", name="uq_user_current_course"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
