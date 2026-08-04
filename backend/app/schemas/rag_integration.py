from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class RagCredentialField(BaseModel):
    """RAG 集成模板中单个凭据或配置字段的前端渲染契约。"""

    key: str
    label: str
    type: str = "text"
    required: bool = False
    default: str | float | None = None
    min: float | None = None
    max: float | None = None
    placeholder: str | None = None
    env_suffix: str | None = None


class RagIntegrationTemplateItem(BaseModel):
    """一个可选 RAG 集成模板的展示、环境变量和凭据字段配置。"""

    key: str
    label: str
    rag_backend: str
    available: bool = True
    credential_fields: list[RagCredentialField] = Field(default_factory=list)
    env_prefix: str | None = None
    env_fallback_hint: str = ""
    docs_url: str | None = None
    meta_json: dict[str, Any] = Field(default_factory=dict)


class RagIntegrationTemplateList(BaseModel):
    """RAG 集成模板列表响应。"""

    items: list[RagIntegrationTemplateItem]
