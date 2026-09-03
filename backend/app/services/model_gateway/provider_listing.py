from __future__ import annotations

import os
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any, Protocol

from app.core.security import mask_secret
from app.services.model_gateway.provider_config import resolve_image_model


class ProviderListingRecord(Protocol):
    """供应商列表格式化所需的最小供应商字段。"""

    provider: str
    display_name: str
    provider_type: str | None
    health_status: str
    priority: int
    is_active: bool
    is_default: bool
    chat_model: str | None
    embedding_model: str | None
    vision_model: str | None
    embedding_dimension: int | None
    max_batch_size: int | None
    rate_limit_rps: int | None
    supports_stream: bool
    supports_tool_call: bool
    supports_json_mode: bool
    base_url: str | None
    protocol: str
    last_checked_at: datetime | None
    daily_limit: int | None
    cost_config_json: Mapping[str, Any] | None
    meta_json: Mapping[str, Any] | None


class ProviderHealthRecord(Protocol):
    """供应商健康状态展示所需的最小字段。"""

    last_error: str | None
    avg_latency_ms: int | None
    consecutive_failures: int


def format_provider_list_item(
    *,
    provider: ProviderListingRecord,
    health: ProviderHealthRecord | None,
    api_key: str | None,
    key_source: str,
) -> dict[str, Any]:
    """将供应商记录和健康状态序列化为管理端列表项。

    参数:
        provider: 数据库供应商记录或具备相同字段的轻量对象。
        health: 最近一次健康检查聚合记录，缺失时按未检查状态展示。
        api_key: 已解析出的真实 API Key，仅用于计算是否配置和脱敏展示。
        key_source: API Key 来源标识，保持与路由层原有字段一致。

    返回:
        可直接返回给管理端供应商列表接口的字典。
    """
    meta = provider.meta_json or {}
    return {
        "provider": provider.provider,
        "display_name": provider.display_name,
        "provider_type": provider.provider_type,
        "status": provider.health_status,
        "priority": provider.priority,
        "is_active": provider.is_active,
        "is_default": provider.is_default,
        "chat_model": provider.chat_model,
        "embedding_model": provider.embedding_model,
        "image_model": resolve_image_model(
            provider_type=provider.provider_type,
            meta_json=meta,
            vision_model=provider.vision_model,
            chat_model=provider.chat_model,
        ),
        "embedding_dimension": provider.embedding_dimension,
        "max_batch_size": provider.max_batch_size,
        "rate_limit_rps": provider.rate_limit_rps,
        "supports_stream": provider.supports_stream,
        "supports_tool_call": provider.supports_tool_call,
        "supports_json_mode": provider.supports_json_mode,
        "key_configured": bool(api_key) or provider.provider == "ollama",
        "key_source": key_source,
        "key_masked": mask_secret(api_key) if api_key else None,
        "base_url": provider.base_url,
        "protocol": provider.protocol,
        "last_checked_at": provider.last_checked_at.isoformat() if provider.last_checked_at else None,
        "last_error": health.last_error if health else None,
        "avg_latency_ms": health.avg_latency_ms if health else None,
        "consecutive_failures": health.consecutive_failures if health else 0,
        "daily_limit": provider.daily_limit,
        "cost_config_json": provider.cost_config_json or {},
        "meta_json": meta,
    }


def masked_provider_api_key_hint(
    provider_code: str,
    env_key_candidates: Mapping[str, Sequence[str]],
) -> str:
    """返回供应商环境变量 API Key 的脱敏提示。

    参数:
        provider_code: 供应商编码，用于选择优先级最高的环境变量候选集。
        env_key_candidates: 供应商到环境变量名列表的映射。

    返回:
        形如 ``ENV_NAME=sk-****`` 的脱敏提示；未命中任何变量时返回 ``missing``。
    """
    for env_name in env_key_candidates.get(provider_code, ("MODEL_GATEWAY_API_KEY",)):
        value = os.getenv(env_name)
        if value:
            return f"{env_name}={mask_secret(value)}"
    return "missing"
