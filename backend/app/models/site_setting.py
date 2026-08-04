from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SiteSetting(Base, TimestampMixin):
    """站点级配置表，用于保存无需按用户隔离的页面体验设置。"""

    __tablename__ = "site_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_by: Mapped[str | None] = mapped_column(String(120), index=True)
