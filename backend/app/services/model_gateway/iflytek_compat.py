from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Protocol

IFLYTEK_SPARK_PROVIDER = "iflytek_spark"
IFLYTEK_SPARK_TEMPLATE = "iflytek-spark"
IFLYTEK_SPARK_HTTP_ORIGIN = "https://spark-api-open.xf-yun.com"
IFLYTEK_SPARK_HTTP_BASE_URL = "https://spark-api-open.xf-yun.com/v1"
IFLYTEK_SPARK_CHAT_COMPLETIONS_URL = "https://spark-api-open.xf-yun.com/v1/chat/completions"
IFLYTEK_SPARK_LITE_MODEL = "lite"
IFLYTEK_SPARK_LEGACY_BASE_URLS = {"https://spark-api-open.xf-yun.com"}
IFLYTEK_SPARK_LEGACY_MODELS = {"generalv3.5", "lite"}


class IflytekSparkProviderLike(Protocol):
    """讯飞星火旧模板归一化需要读写的供应商最小字段。"""

    provider: str
    base_url: str | None
    chat_model: str | None
    meta_json: Mapping[str, Any] | None


def normalize_iflytek_spark_values(
    provider_code: str,
    base_url: str | None,
    chat_model: str | None,
    meta_json: Mapping[str, Any] | None,
) -> tuple[str | None, str | None]:
    """兼容讯飞星火 HTTP 模板旧默认值。

    参数:
        provider_code: 供应商编码，用于识别已保存的讯飞星火配置。
        base_url: 当前配置的模型接口根地址。
        chat_model: 当前配置的聊天模型名。
        meta_json: 供应商附加元数据，可能包含模板标识。

    返回:
        归一化后的 base_url 和 chat_model；非讯飞星火配置保持原值。
    """
    meta = meta_json or {}
    template = str(meta.get("template") or "").strip()
    normalized_base_url = (base_url or "").strip().rstrip("/")
    is_iflytek_endpoint = normalized_base_url.startswith(IFLYTEK_SPARK_HTTP_ORIGIN)
    if provider_code != IFLYTEK_SPARK_PROVIDER and template != IFLYTEK_SPARK_TEMPLATE and not is_iflytek_endpoint:
        return base_url, chat_model

    next_base_url = IFLYTEK_SPARK_HTTP_BASE_URL if normalized_base_url in IFLYTEK_SPARK_LEGACY_BASE_URLS else base_url
    if normalized_base_url == IFLYTEK_SPARK_CHAT_COMPLETIONS_URL:
        next_base_url = IFLYTEK_SPARK_HTTP_BASE_URL
    normalized_model = (chat_model or "").strip()
    next_chat_model = IFLYTEK_SPARK_LITE_MODEL if normalized_model.lower() in IFLYTEK_SPARK_LEGACY_MODELS else chat_model
    return next_base_url, next_chat_model


def normalize_iflytek_spark_provider(provider: IflytekSparkProviderLike) -> None:
    """直接归一化供应商对象中的讯飞星火旧模板字段。"""

    provider.base_url, provider.chat_model = normalize_iflytek_spark_values(
        provider.provider,
        provider.base_url,
        provider.chat_model,
        provider.meta_json or {},
    )
