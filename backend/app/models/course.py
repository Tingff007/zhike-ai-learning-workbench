import uuid
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Course(Base, UUIDMixin, TimestampMixin):
    """记录课程基础信息及其展示、模型和知识库配置。"""

    __tablename__ = "courses"

    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text())
    cover_url: Mapped[str | None] = mapped_column(String(500))
    applicable_major: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    display_config: Mapped[dict] = mapped_column(JSONB, default=dict)
    model_config_json: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    iflytek_repo_id: Mapped[str | None] = mapped_column(String(64))

    sections = relationship("CourseSection", back_populates="course", cascade="all, delete-orphan")
    concepts = relationship("CourseConcept", back_populates="course", cascade="all, delete-orphan")


class CourseSection(Base, UUIDMixin, TimestampMixin):
    """记录课程下的章节结构，用于组织知识点与学习内容。"""

    __tablename__ = "course_sections"
    __table_args__ = (UniqueConstraint("course_id", "code", name="uq_course_section_code"),)

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text())
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))

    course = relationship("Course", back_populates="sections")
    concepts = relationship("CourseConcept", back_populates="section")


class CourseConcept(Base, UUIDMixin, TimestampMixin):
    """记录课程知识点及其难度、顺序和学习依赖元数据。"""

    __tablename__ = "course_concepts"
    __table_args__ = (UniqueConstraint("course_id", "code", name="uq_course_concept_code"),)

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    section_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("course_sections.id", ondelete="SET NULL"), index=True)
    code: Mapped[str] = mapped_column(String(120), index=True)
    title: Mapped[str] = mapped_column(String(200))
    definition: Mapped[str | None] = mapped_column(Text())
    difficulty: Mapped[str] = mapped_column(String(32), default="basic")
    recommended_order: Mapped[int] = mapped_column(Integer, default=0)
    prerequisites_json: Mapped[list[str]] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(32), default="published")
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))

    course = relationship("Course", back_populates="concepts")
    section = relationship("CourseSection", back_populates="concepts")


class ConceptPrerequisite(Base, UUIDMixin, TimestampMixin):
    """记录知识点之间的先修依赖关系，支持学习路径规划。"""

    __tablename__ = "concept_prerequisites"
    __table_args__ = (UniqueConstraint("concept_id", "prerequisite_id", name="uq_concept_prerequisite"),)

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    concept_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("course_concepts.id", ondelete="CASCADE"), index=True)
    prerequisite_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("course_concepts.id", ondelete="CASCADE"), index=True)
    dependency_type: Mapped[str] = mapped_column(String(32), default="strong")


class CourseContextSnapshot(Base, UUIDMixin, TimestampMixin):
    """记录课程学习上下文快照，供对话、资源生成和路径推荐复用。"""

    __tablename__ = "course_context_snapshots"

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    concept_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("course_concepts.id", ondelete="SET NULL"), index=True)
    path_node_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("path_nodes.id", ondelete="SET NULL"), index=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("conversations.id", ondelete="SET NULL"), index=True)
    profile_scope: Mapped[str] = mapped_column(String(32), default="course")
    resource_scope: Mapped[str] = mapped_column(String(32), default="course")
    model_config_id: Mapped[str] = mapped_column(String(120), default="platform_default")
    snapshot_json: Mapped[dict] = mapped_column(JSONB, default=dict)
