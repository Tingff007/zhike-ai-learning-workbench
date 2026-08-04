from pydantic import BaseModel, Field


class ChatdocVendorQuotaItem(BaseModel):
    """讯飞星火知识库配额的单项用量和扣减规则。"""

    key: str
    label: str
    unit: str
    used: int
    limit: int | None = None
    remaining: int | None = None
    utilization_pct: float | None = None
    deduction_rule: str


class ChatdocVendorQuotaView(BaseModel):
    """指定知识库集成的供应商配额总览。"""

    integration_key: str
    package_note: str | None = None
    items: list[ChatdocVendorQuotaItem]
    updated_at: str | None = None


class ChatdocVendorQuotaUpsert(BaseModel):
    """管理员更新供应商配额上限和套餐说明的请求。"""

    upload_limit_pages: int | None = Field(default=None, ge=0)
    doc_qa_limit: int | None = Field(default=None, ge=0)
    extract_limit: int | None = Field(default=None, ge=0)
    package_note: str | None = None


class ChatdocVendorQuotaResetUsed(BaseModel):
    """管理员重置供应商配额已用量的请求。"""

    upload_used_pages: int | None = Field(default=None, ge=0)
    doc_qa_used: int | None = Field(default=None, ge=0)
    extract_used: int | None = Field(default=None, ge=0)
