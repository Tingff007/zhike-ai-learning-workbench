import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class ModelProvider(Base, UUIDMixin, TimestampMixin):
    """模型网关中可调用供应商的连接、能力和成本配置。"""

    __tablename__ = "model_providers"

    provider: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    provider_type: Mapped[str] = mapped_column(String(32), default="both", server_default="both", index=True)
    base_url: Mapped[str | None] = mapped_column(String(500))
    api_key_encrypted: Mapped[str | None] = mapped_column(Text())
    protocol: Mapped[str] = mapped_column(String(64), default="openai_compatible")
    chat_model: Mapped[str | None] = mapped_column(String(120))
    embedding_model: Mapped[str | None] = mapped_column(String(120))
    embedding_dimension: Mapped[int | None] = mapped_column(Integer)
    max_batch_size: Mapped[int] = mapped_column(Integer, default=10, server_default="10")
    rate_limit_rps: Mapped[int | None] = mapped_column(Integer)
    vision_model: Mapped[str | None] = mapped_column(String(120))
    supports_stream: Mapped[bool] = mapped_column(Boolean, default=True)
    supports_tool_call: Mapped[bool] = mapped_column(Boolean, default=False)
    supports_json_mode: Mapped[bool] = mapped_column(Boolean, default=True)
    health_status: Mapped[str] = mapped_column(String(32), default="healthy", index=True)
    priority: Mapped[int] = mapped_column(Integer, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    daily_limit: Mapped[int | None] = mapped_column(Integer)
    cost_config_json: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class ModelProviderHealth(Base, UUIDMixin, TimestampMixin):
    """模型供应商的健康检查结果和连续失败状态。"""

    __tablename__ = "model_provider_health"

    provider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("model_providers.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    success_rate: Mapped[float] = mapped_column(default=1.0)
    avg_latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text())


class ModelCallLog(Base, UUIDMixin, TimestampMixin):
    """模型调用的审计、用量、延迟和失败记录。"""

    __tablename__ = "model_call_logs"

    course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    provider_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("model_providers.id", ondelete="SET NULL"), index=True)
    agent_name: Mapped[str | None] = mapped_column(String(120))
    capability: Mapped[str] = mapped_column(String(32), default="chat", server_default="chat", index=True)
    model_name: Mapped[str | None] = mapped_column(String(120))
    request_count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    batch_count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    embedding_dim: Mapped[int | None] = mapped_column(Integer)
    token_input: Mapped[int] = mapped_column(Integer, default=0)
    token_output: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="success")
    error_message: Mapped[str | None] = mapped_column(Text())
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))


class UserModelOverride(Base, UUIDMixin, TimestampMixin):
    """用户级模型供应商覆盖配置。"""

    __tablename__ = "user_model_overrides"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(120))
    base_url: Mapped[str | None] = mapped_column(String(500))
    api_key_encrypted: Mapped[str | None] = mapped_column(Text())
    chat_model: Mapped[str | None] = mapped_column(String(120))
    embedding_model: Mapped[str | None] = mapped_column(String(120))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
