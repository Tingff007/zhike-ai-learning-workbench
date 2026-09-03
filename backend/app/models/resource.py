import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class Resource(Base, UUIDMixin, TimestampMixin):
    """资源大厅和学习路径复用的教学资源主记录。"""

    __tablename__ = "resources"
    __table_args__ = (UniqueConstraint("course_id", "code", name="uq_resource_code"),)

    course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=True)
    concept_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("course_concepts.id", ondelete="SET NULL"), index=True)
    path_node_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("path_nodes.id", ondelete="SET NULL"), index=True)
    code: Mapped[str] = mapped_column(String(120), index=True)
    title: Mapped[str] = mapped_column(String(255))
    resource_type: Mapped[str] = mapped_column(String(64), index=True)
    difficulty: Mapped[str] = mapped_column(String(32), default="basic")
    status: Mapped[str] = mapped_column(String(32), default="private", index=True)
    summary: Mapped[str] = mapped_column(Text())
    content_uri: Mapped[str | None] = mapped_column(String(500))
    generation_basis_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    citations_json: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    quality_check_result: Mapped[dict] = mapped_column(JSONB, default=dict)
    safety_status: Mapped[str] = mapped_column(String(32), default="passed")
    quality_score: Mapped[int] = mapped_column(Integer, default=80)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    copied_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)


class ResourceVersion(Base, UUIDMixin, TimestampMixin):
    """教学资源正文的版本化内容记录。"""

    __tablename__ = "resource_versions"

    resource_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    content: Mapped[str] = mapped_column(Text())
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class ResourceAsset(Base, UUIDMixin, TimestampMixin):
    """资源生成过程中产出的图片、图表等媒体资产。"""

    __tablename__ = "resource_assets"

    resource_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("resource_generation_tasks.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    asset_kind: Mapped[str] = mapped_column(String(64), default="generated_image", index=True)
    diagram_type: Mapped[str | None] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str | None] = mapped_column(String(500))
    mime_type: Mapped[str | None] = mapped_column(String(120))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    provider: Mapped[str | None] = mapped_column(String(120), index=True)
    model: Mapped[str | None] = mapped_column(String(120))
    prompt: Mapped[str | None] = mapped_column(Text())
    revised_prompt: Mapped[str | None] = mapped_column(Text())
    source_asset_ids_json: Mapped[list[str]] = mapped_column(JSONB, default=list)
    raw_params_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="completed", index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ResourceGenerationTask(Base, UUIDMixin, TimestampMixin):
    """AI 教学资源生成后台任务状态。"""

    __tablename__ = "resource_generation_tasks"

    course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=True)
    concept_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("course_concepts.id", ondelete="SET NULL"), index=True)
    path_node_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("path_nodes.id", ondelete="SET NULL"), index=True)
    requested_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    resource_type: Mapped[str] = mapped_column(String(64))
    difficulty: Mapped[str] = mapped_column(String(32), default="basic")
    goal: Mapped[str] = mapped_column(Text())
    requirements: Mapped[str | None] = mapped_column(Text())
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    steps_json: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    orchestration_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    draft_content: Mapped[str | None] = mapped_column(Text())
    outline_json: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    result_resource_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("resources.id", ondelete="SET NULL"))
    error_message: Mapped[str | None] = mapped_column(Text())
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    worker_id: Mapped[str | None] = mapped_column(String(120))
    trace_id: Mapped[str | None] = mapped_column(String(120))


class CommunityResource(Base, UUIDMixin, TimestampMixin):
    """社区资源投稿及审核状态记录。"""

    __tablename__ = "community_resources"

    resource_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=True)
    submitted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    review_status: Mapped[str] = mapped_column(String(32), default="pending_review", index=True)
    review_result_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
