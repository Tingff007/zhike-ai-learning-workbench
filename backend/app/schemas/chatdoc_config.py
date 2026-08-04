from typing import Any

from pydantic import BaseModel, Field

from app.schemas.chatdoc_vendor_quota import ChatdocVendorQuotaView


class ChatdocConfigUpsert(BaseModel):
    """讯飞 ChatDoc 接入配置保存请求。"""

    integration_key: str | None = None
    preset_template_key: str | None = None
    display_label: str | None = None
    set_active: bool = False
    app_id: str | None = None
    base_url: str | None = None
    api_secret: str | None = None
    clear_api_secret: bool = False
    wiki_filter_score: float | None = Field(default=None, ge=0.0, le=1.0)
    pipeline_config_json: dict[str, Any] | None = None
    is_active: bool | None = None
    icon_file: str | None = None


class ChatdocAvailableTemplateSummary(BaseModel):
    """讯飞 ChatDoc 管理视图中的可选模板摘要。"""

    key: str
    label: str
    rag_backend: str
    available: bool = True


class ChatdocConfigAdminView(BaseModel):
    """讯飞 ChatDoc 接入实例管理视图。"""

    integration_key: str
    active_integration_key: str | None = None
    template_key: str | None = None
    template_label: str
    template_available: bool = False
    rag_backend: str
    app_id: str | None = None
    base_url: str | None = None
    effective_app_id: str | None = None
    api_secret_masked: str | None = None
    has_stored_secret: bool = False
    configured: bool = False
    admin_configured: bool = False
    credential_source: str | None = None
    wiki_filter_score: float | None = None
    pipeline_config_json: dict[str, Any] | None = None
    icon_file: str | None = None
    is_active: bool = True
    last_test_status: str | None = None
    last_test_message: str | None = None
    last_tested_at: str | None = None
    env_fallback_hint: str = ""
    credential_env_vars: dict[str, str] = Field(default_factory=dict)
    docs_url: str | None = None
    available_templates: list[ChatdocAvailableTemplateSummary] = Field(default_factory=list)
    vendor_quota: ChatdocVendorQuotaView | None = None
    gateway_listed: bool | None = None
    view_error: str | None = None
    status: str | None = None
    message: str | None = None
    removed: bool | None = None


class ChatdocConfigInstanceList(BaseModel):
    """讯飞 ChatDoc 接入实例列表响应。"""

    items: list[ChatdocConfigAdminView]
    total: int
    active_integration_key: str
