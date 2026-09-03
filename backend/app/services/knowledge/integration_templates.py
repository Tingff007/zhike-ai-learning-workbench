"""知识库 / RAG 接入预置模板 — 从 JSON 加载，供管理端 API 使用。"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.schemas.rag_integration import RagCredentialField, RagIntegrationTemplateItem, RagIntegrationTemplateList

_TEMPLATES_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "rag_integration_templates.json"

# 兼容旧配置中使用下划线的 RAG 接入标识。
LEGACY_INTEGRATION_KEY_MAP: dict[str, str] = {
    "iflytek_chatdoc": "iflytek-chatdoc",
}


@lru_cache(maxsize=1)
def _load_raw() -> dict[str, Any]:
    """读取并缓存原始 RAG 接入模板 JSON。"""
    with _TEMPLATES_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def list_integration_templates() -> RagIntegrationTemplateList:
    """加载所有 RAG 接入模板并转换为 API Schema。

    返回:
        可返回给管理端的 RAG 接入模板列表。

    异常:
        FileNotFoundError: 模板 JSON 文件不存在时抛出。
        json.JSONDecodeError: 模板 JSON 格式非法时抛出。
    """
    raw = _load_raw()
    items = [
        RagIntegrationTemplateItem(
            key=str(entry["key"]),
            label=str(entry["label"]),
            rag_backend=str(entry["rag_backend"]),
            available=bool(entry.get("available", True)),
            credential_fields=[
                RagCredentialField.model_validate(field) for field in entry.get("credential_fields", [])
            ],
            env_prefix=entry.get("env_prefix"),
            env_fallback_hint=str(entry.get("env_fallback_hint") or ""),
            docs_url=entry.get("docs_url"),
            meta_json=dict(entry.get("meta_json") or {}),
        )
        for entry in raw.get("items", [])
    ]
    return RagIntegrationTemplateList(items=items)


def get_template(key: str | None) -> RagIntegrationTemplateItem | None:
    """按模板 key 获取单个 RAG 接入模板。

    参数:
        key: 模板 key，允许使用旧版下划线标识。

    返回:
        命中的模板；未命中或 key 为空时返回 None。
    """
    if not key:
        return None
    normalized = normalize_template_key(key)
    return next((item for item in list_integration_templates().items if item.key == normalized), None)


def normalize_template_key(key: str | None) -> str:
    """标准化 RAG 接入模板 key。

    参数:
        key: 用户或旧配置传入的模板 key。

    返回:
        当前模板系统使用的规范 key；为空时返回默认模板 key。
    """
    if not key:
        return default_template_key()
    trimmed = key.strip()
    return LEGACY_INTEGRATION_KEY_MAP.get(trimmed, trimmed)


def default_template_key() -> str:
    """返回默认 RAG 接入模板 key。

    返回:
        优先返回第一个可用模板；没有可用模板时返回模板列表首项。
    """
    items = list_integration_templates().items
    preferred = next((item.key for item in items if item.available), None)
    return preferred or items[0].key


def template_key_for_rag_backend(rag_backend: str | None) -> str:
    """根据 RAG 后端标识反查模板 key。

    参数:
        rag_backend: 数据库或配置中保存的 RAG 后端标识。

    返回:
        匹配的模板 key；未知后端返回默认模板 key。
    """
    backend = (rag_backend or "").strip()
    if not backend:
        return default_template_key()
    for item in list_integration_templates().items:
        if item.rag_backend == backend:
            return item.key
    return LEGACY_INTEGRATION_KEY_MAP.get(backend, default_template_key())


def reload_integration_templates_cache() -> None:
    """清空 RAG 接入模板缓存，供测试或配置热更新后重新加载。"""
    _load_raw.cache_clear()
