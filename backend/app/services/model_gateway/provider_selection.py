from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from sqlalchemy import or_, select

from app.models import ModelProvider
from app.services.model_gateway.runtime_types import GatewayProviderConfig


FILTERED_PROVIDER_CAPABILITIES = frozenset(
    {
        "chat",
        "embedding",
        "vision",
        "multimodal_embedding",
        "rerank",
        "vlm",
        "ocr",
        "image",
        "image_generation",
    }
)


def provider_types_for_capability(capability: str) -> set[str]:
    """把能力名称映射为可兼容的供应商类型集合。"""

    if capability in {"vlm", "ocr"}:
        return {capability, "vision"}
    if capability in {"image", "image_generation"}:
        return {"image", "image_generation"}
    return {capability}


def build_provider_rows_statement(
    *,
    capability: str = "all",
    active_only: bool = True,
) -> sa.Select[Any]:
    """构造按能力和启用状态查询供应商记录的 SQLAlchemy 语句。"""

    stmt = select(ModelProvider)
    if active_only:
        stmt = stmt.where(ModelProvider.is_active.is_(True))
    if capability in FILTERED_PROVIDER_CAPABILITIES:
        provider_types = provider_types_for_capability(capability)
        stmt = stmt.where(or_(ModelProvider.provider_type.in_(provider_types), ModelProvider.provider_type == "both"))
        if capability == "chat":
            stmt = stmt.where(ModelProvider.chat_model.is_not(None))
        if capability in {"embedding", "multimodal_embedding"}:
            stmt = stmt.where(ModelProvider.embedding_model.is_not(None))
        if capability in {"vision", "vlm", "ocr"}:
            stmt = stmt.where(ModelProvider.vision_model.is_not(None))
    return stmt.order_by(
        ModelProvider.is_default.desc(),
        ModelProvider.priority.asc(),
        ModelProvider.display_name.asc(),
    )


def config_supports_capability(config: GatewayProviderConfig, capability: str) -> bool:
    """判断运行时供应商配置是否支持指定能力。"""

    if not config.is_active:
        return False
    if config.provider_type not in {*provider_types_for_capability(capability), "both"}:
        return False
    return (
        (capability == "chat" and bool(config.chat_model))
        or (capability == "embedding" and bool(config.embedding_model))
        or (capability == "multimodal_embedding" and bool(config.embedding_model))
        or (capability == "rerank" and bool(config.chat_model or config.embedding_model))
        or (capability in {"vision", "vlm", "ocr"} and bool(config.vision_model))
        or (capability in {"image", "image_generation"} and bool(config.image_model))
    )


def filter_configs_for_capability(
    configs: Sequence[GatewayProviderConfig],
    capability: str,
) -> list[GatewayProviderConfig]:
    """按能力筛选运行时供应商配置，并保留上游排序顺序。"""

    return [config for config in configs if config_supports_capability(config, capability)]
