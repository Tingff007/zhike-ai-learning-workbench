import uuid
from datetime import date
from sqlalchemy import Date, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class UserProfile(Base, UUIDMixin, TimestampMixin):
    """用户跨课程学习画像的汇总记录。"""

    __tablename__ = "user_profiles"
    __table_args__ = (UniqueConstraint("user_id", name="uq_user_profile_user"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    summary: Mapped[str | None] = mapped_column(Text())
    confidence: Mapped[float] = mapped_column(default=0.0)


class CourseProfile(Base, UUIDMixin, TimestampMixin):
    """用户在单门课程内的学习画像汇总记录。"""

    __tablename__ = "course_profiles"
    __table_args__ = (UniqueConstraint("course_id", "user_id", name="uq_course_profile"),)

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    summary: Mapped[str | None] = mapped_column(Text())
    confidence: Mapped[float] = mapped_column(default=0.0)


class ProfileDimension(Base, UUIDMixin, TimestampMixin):
    """画像中的单个能力、偏好或风险维度评分。"""

    __tablename__ = "profile_dimensions"
    __table_args__ = (
        UniqueConstraint("profile_id", "dimension_key", name="uq_profile_dimension"),
        UniqueConstraint("user_profile_id", "profile_scope", "dimension_key", name="uq_user_profile_dimension_scope"),
    )

    profile_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("course_profiles.id", ondelete="CASCADE"), index=True, nullable=True)
    user_profile_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user_profiles.id", ondelete="CASCADE"), index=True, nullable=True)
    profile_scope: Mapped[str] = mapped_column(String(32), default="course", server_default="course", index=True)
    dimension_key: Mapped[str] = mapped_column(String(120), index=True)
    dimension_name: Mapped[str] = mapped_column(String(120))
    score: Mapped[int] = mapped_column(Integer, default=0)
    label: Mapped[str | None] = mapped_column(String(120))
    confidence: Mapped[float] = mapped_column(default=0.0)
    evidence_json: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(32), default="active", server_default="active", index=True)


class ProfileEvidence(Base, UUIDMixin, TimestampMixin):
    """支撑画像维度变化的学习行为证据。"""

    __tablename__ = "profile_evidence"

    profile_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("course_profiles.id", ondelete="CASCADE"), index=True, nullable=True)
    user_profile_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user_profiles.id", ondelete="CASCADE"), index=True, nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("conversations.id", ondelete="SET NULL"), index=True, nullable=True)
    scope: Mapped[str] = mapped_column(String(32), default="course", server_default="course", index=True)
    dimension_key: Mapped[str] = mapped_column(String(120), index=True)
    label: Mapped[str | None] = mapped_column(String(120))
    source_type: Mapped[str] = mapped_column(String(64))
    source_id: Mapped[str | None] = mapped_column(String(120))
    delta: Mapped[int] = mapped_column(Integer, default=0)
    confidence_delta: Mapped[float] = mapped_column(default=0.0, server_default="0")
    note: Mapped[str] = mapped_column(Text())
    summary: Mapped[str | None] = mapped_column(Text())
    confidence: Mapped[float] = mapped_column(default=0.0)
    status: Mapped[str] = mapped_column(String(32), default="active", server_default="active", index=True)


class LearningPath(Base, UUIDMixin, TimestampMixin):
    """面向用户和课程生成的学习路径版本。"""

    __tablename__ = "learning_paths"
    __table_args__ = (UniqueConstraint("course_id", "user_id", "version", name="uq_learning_path_version"),)

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(32), default="active")
    source: Mapped[str] = mapped_column(String(64), default="seed")
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class PathNode(Base, UUIDMixin, TimestampMixin):
    """学习路径中的单个知识点或任务节点。"""

    __tablename__ = "path_nodes"
    __table_args__ = (UniqueConstraint("learning_path_id", "code", name="uq_path_node_code"),)

    learning_path_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("learning_paths.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    concept_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("course_concepts.id", ondelete="SET NULL"), index=True)
    code: Mapped[str] = mapped_column(String(120), index=True)
    title: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(32), default="not_started", index=True)
    mastery: Mapped[int] = mapped_column(Integer, default=0)
    is_remedial: Mapped[bool] = mapped_column(default=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    prerequisites_json: Mapped[list[str]] = mapped_column(JSONB, default=list)
    recommendation_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class ConceptMastery(Base, UUIDMixin, TimestampMixin):
    """用户对课程知识点的掌握度状态。"""

    __tablename__ = "concept_mastery"
    __table_args__ = (UniqueConstraint("course_id", "user_id", "concept_id", name="uq_concept_mastery"),)

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    concept_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("course_concepts.id", ondelete="CASCADE"), index=True)
    mastery: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="not_started")
    evidence_json: Mapped[list[dict]] = mapped_column(JSONB, default=list)


class LearningEvent(Base, UUIDMixin, TimestampMixin):
    """记录会影响画像、路径或推荐的学习行为事件。"""

    __tablename__ = "learning_events"

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    concept_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("course_concepts.id", ondelete="SET NULL"), index=True)
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    source_type: Mapped[str | None] = mapped_column(String(80), index=True)
    source_id: Mapped[str | None] = mapped_column(String(160), index=True)
    evidence_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class LearningScheduleItem(Base, UUIDMixin, TimestampMixin):
    """用户学习日程中的计划项或推荐学习安排。"""

    __tablename__ = "learning_schedule_items"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    concept_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("course_concepts.id", ondelete="SET NULL"), index=True)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("resources.id", ondelete="SET NULL"), index=True)
    path_node_id: Mapped[str | None] = mapped_column(String(160), index=True)
    source_type: Mapped[str] = mapped_column(String(64), default="manual", index=True)
    source_id: Mapped[str | None] = mapped_column(String(160), index=True)
    item_type: Mapped[str] = mapped_column(String(64), default="focus", index=True)
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str | None] = mapped_column(Text())
    scheduled_date: Mapped[date] = mapped_column(Date(), index=True)
    time_label: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="planned", index=True)
    priority: Mapped[int] = mapped_column(Integer, default=50)
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict)
