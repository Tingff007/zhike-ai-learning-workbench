from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ChatdocVendorQuota(Base, TimestampMixin):
    """本系统记录的讯飞 ChatDoc 套餐余量（上限由管理员按控制台采购填写）。"""

    __tablename__ = "chatdoc_vendor_quotas"

    integration_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    upload_limit_pages: Mapped[int | None] = mapped_column(Integer())
    doc_qa_limit: Mapped[int | None] = mapped_column(Integer())
    extract_limit: Mapped[int | None] = mapped_column(Integer())
    upload_used_pages: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    doc_qa_used: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    extract_used: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    package_note: Mapped[str | None] = mapped_column(Text())
    updated_by_external_id: Mapped[str | None] = mapped_column(String(128))
