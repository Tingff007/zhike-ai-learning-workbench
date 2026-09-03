from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class RagIntegrationConfig(Base, UUIDMixin, TimestampMixin):
    """按 integration_key 区分的单例式知识库接入凭证配置。"""

    __tablename__ = "rag_integration_configs"

    integration_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    preset_template_key: Mapped[str | None] = mapped_column(String(64))
    display_label: Mapped[str | None] = mapped_column(String(128))
    app_id: Mapped[str | None] = mapped_column(String(128))
    base_url: Mapped[str | None] = mapped_column(String(512))
    api_secret_encrypted: Mapped[str | None] = mapped_column(Text())
    wiki_filter_score: Mapped[float | None] = mapped_column(Float())
    pipeline_config_json: Mapped[str | None] = mapped_column(Text())
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    gateway_listed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    icon_file: Mapped[str | None] = mapped_column(String(128))
    last_test_status: Mapped[str | None] = mapped_column(String(32))
    last_test_message: Mapped[str | None] = mapped_column(Text())
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_by_external_id: Mapped[str | None] = mapped_column(String(128))
