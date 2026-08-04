import uuid
from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class SafetyEvent(Base, UUIDMixin, TimestampMixin):
    """记录安全风控事件及其处理动作，用于审计和运营跟踪。"""

    __tablename__ = "safety_events"

    course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    event_type: Mapped[str] = mapped_column(String(120))
    severity: Mapped[str] = mapped_column(String(32), default="low")
    action: Mapped[str] = mapped_column(String(64), default="logged")
    note: Mapped[str | None] = mapped_column(Text())
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class ContentReviewLog(Base, UUIDMixin, TimestampMixin):
    """记录资源内容审核动作和审核结果，支撑人工质检闭环。"""

    __tablename__ = "content_review_logs"

    resource_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("resources.id", ondelete="SET NULL"), index=True)
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(64))
    note: Mapped[str | None] = mapped_column(Text())
    result_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class AdminAuditLog(Base, UUIDMixin, TimestampMixin):
    """记录管理员操作审计信息，便于追踪关键后台变更。"""

    __tablename__ = "admin_audit_logs"

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(120))
    target_type: Mapped[str | None] = mapped_column(String(120))
    target_id: Mapped[str | None] = mapped_column(String(120))
    detail_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class UsageMetricsDaily(Base, UUIDMixin, TimestampMixin):
    """记录平台每日使用、检索、生成和安全指标汇总。"""

    __tablename__ = "usage_metrics_daily"

    metric_date: Mapped[str] = mapped_column(Date, index=True)
    course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), index=True)
    dau: Mapped[int] = mapped_column(Integer, default=0)
    course_visits: Mapped[int] = mapped_column(Integer, default=0)
    path_nodes_completed: Mapped[int] = mapped_column(Integer, default=0)
    rag_hit_rate: Mapped[float] = mapped_column(default=0.0)
    citation_coverage: Mapped[float] = mapped_column(default=0.0)
    resource_success_rate: Mapped[float] = mapped_column(default=0.0)
    p95_latency: Mapped[float] = mapped_column(default=0.0)
    model_failure_rate: Mapped[float] = mapped_column(default=0.0)
    queue_backlog: Mapped[int] = mapped_column(Integer, default=0)
    safety_blocks: Mapped[int] = mapped_column(Integer, default=0)
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class CourseMetricsDaily(Base, UUIDMixin, TimestampMixin):
    """记录单门课程每日学习活跃度、掌握度和资源测评指标。"""

    __tablename__ = "course_metrics_daily"

    metric_date: Mapped[str] = mapped_column(Date, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    active_learners: Mapped[int] = mapped_column(Integer, default=0)
    avg_mastery: Mapped[float] = mapped_column(default=0.0)
    resource_count: Mapped[int] = mapped_column(Integer, default=0)
    assessment_count: Mapped[int] = mapped_column(Integer, default=0)
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class RagQueryLog(Base, UUIDMixin, TimestampMixin):
    """记录 RAG 检索查询及命中、引用和延迟结果，用于质量分析。"""

    __tablename__ = "rag_query_logs"

    course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), index=True)
    concept_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("course_concepts.id", ondelete="SET NULL"), index=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("conversations.id", ondelete="SET NULL"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    intent: Mapped[str] = mapped_column(String(64), default="course_qa", index=True)
    query_text: Mapped[str | None] = mapped_column(Text())
    hit: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    top_score: Mapped[float] = mapped_column(default=0.0)
    citation_count: Mapped[int] = mapped_column(Integer, default=0)
    refused: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    retrieval_scope: Mapped[str] = mapped_column(String(64), default="course")
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict)
