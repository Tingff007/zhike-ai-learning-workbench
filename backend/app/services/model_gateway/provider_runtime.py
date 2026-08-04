from __future__ import annotations

import os
from collections.abc import Mapping, Sequence

from app.core.config import settings
from app.core.security import decrypt_secret
from app.models import ModelProvider
from app.services.model_gateway.iflytek_compat import normalize_iflytek_spark_values
from app.services.model_gateway.provider_config import resolve_image_model
from app.services.model_gateway.runtime_types import GatewayProviderConfig


def provider_api_key_source(
    provider: ModelProvider,
    env_key_candidates: Mapping[str, Sequence[str]],
) -> tuple[str | None, str]:
    """按环境变量、本地供应商和数据库密文解析供应商 API Key 来源。

    参数:
        provider: 数据库中的模型供应商记录。
        env_key_candidates: 供应商编码到候选环境变量名的映射。

    返回:
        二元组，第一项为 API Key 明文或 None，第二项为来源标识。
    """

    for env_name in env_key_candidates.get(
        provider.provider,
        (f"{provider.provider.upper()}_API_KEY", "MODEL_GATEWAY_API_KEY"),
    ):
        value = os.getenv(env_name)
        if value:
            return value, env_name
    if provider.provider == "ollama":
        return os.getenv("OLLAMA_API_KEY"), "local_ollama"
    if provider.api_key_encrypted:
        return decrypt_secret(provider.api_key_encrypted), "database_encrypted"
    return None, "missing"


def provider_has_api_key(provider: ModelProvider, env_key_candidates: Mapping[str, Sequence[str]]) -> bool:
    """判断供应商是否具备调用所需 API Key 或本地免密条件。"""

    return bool(provider_api_key_source(provider, env_key_candidates)[0]) or provider.provider == "ollama"


def provider_to_runtime_config(
    provider: ModelProvider,
    env_key_candidates: Mapping[str, Sequence[str]],
) -> GatewayProviderConfig:
    """将数据库供应商记录转换为模型调用所需的运行时配置。"""

    api_key, key_source = provider_api_key_source(provider, env_key_candidates)
    meta = provider.meta_json or {}
    base_url, chat_model = normalize_iflytek_spark_values(
        provider.provider,
        provider.base_url,
        provider.chat_model,
        meta,
    )
    return GatewayProviderConfig(
        id=provider.id,
        provider=provider.provider,
        display_name=provider.display_name,
        provider_type=provider.provider_type or "both",
        base_url=base_url or settings.MODEL_GATEWAY_BASE_URL,
        api_key=api_key,
        key_source=key_source,
        protocol=provider.protocol,
        chat_model=chat_model or settings.DEFAULT_CHAT_MODEL,
        embedding_model=provider.embedding_model,
        vision_model=provider.vision_model,
        image_model=resolve_image_model(
            provider_type=provider.provider_type,
            meta_json=meta,
            vision_model=provider.vision_model,
            chat_model=provider.chat_model,
        ),
        embedding_dimension=provider.embedding_dimension,
        max_batch_size=max(1, provider.max_batch_size or 10),
        rate_limit_rps=provider.rate_limit_rps,
        supports_stream=provider.supports_stream,
        supports_json_mode=provider.supports_json_mode,
        priority=provider.priority,
        is_active=provider.is_active,
        is_default=provider.is_default,
        daily_limit=provider.daily_limit,
        cost_config=provider.cost_config_json or {},
        fallback_providers=tuple(str(item) for item in meta.get("fallback_providers", []) if item),
        fallback_mode=str(meta.get("fallback_mode") or "ordered"),
        skip_unhealthy=bool(meta.get("skip_unhealthy", True)),
        meta_json=meta,
    )


def build_env_default_config() -> GatewayProviderConfig:
    """构造仅依赖环境变量的默认供应商配置，用于数据库缺省时兜底。"""

    api_key = os.getenv("MODEL_GATEWAY_API_KEY")
    return GatewayProviderConfig(
        id=None,
        provider=settings.DEFAULT_MODEL_PROVIDER,
        display_name=settings.DEFAULT_MODEL_PROVIDER,
        provider_type="both",
        base_url=settings.MODEL_GATEWAY_BASE_URL,
        api_key=api_key,
        key_source="MODEL_GATEWAY_API_KEY" if api_key else "missing",
        protocol="openai_compatible",
        chat_model=settings.DEFAULT_CHAT_MODEL,
        embedding_model=settings.DEFAULT_EMBEDDING_MODEL,
        vision_model=None,
        image_model=None,
        embedding_dimension=settings.EMBEDDING_DIM,
        max_batch_size=10,
        rate_limit_rps=None,
        supports_stream=True,
        supports_json_mode=True,
        priority=100,
        is_active=True,
        is_default=True,
        daily_limit=None,
        cost_config={},
        fallback_providers=(),
        fallback_mode="ordered",
        skip_unhealthy=True,
        meta_json={},
    )
