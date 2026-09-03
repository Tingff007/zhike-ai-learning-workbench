"""模型网关供应商预置模板 — 从 JSON 加载，供管理端 API 使用。"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.schemas.model_gateway import ModelProviderTemplateItem, ModelProviderTemplateList, ModelProviderUpsert

_TEMPLATES_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "model_provider_templates.json"


@lru_cache(maxsize=1)
def _load_raw() -> dict[str, Any]:
    with _TEMPLATES_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def list_provider_templates() -> ModelProviderTemplateList:
    """加载模型供应商预置模板，返回管理端可直接展示的模板列表。"""
    raw = _load_raw()
    items = [
        ModelProviderTemplateItem(
            key=str(entry["key"]),
            label=str(entry["label"]),
            payload=ModelProviderUpsert.model_validate(entry["payload"]),
        )
        for entry in raw.get("items", [])
    ]
    return ModelProviderTemplateList(items=items)


def reload_provider_templates_cache() -> None:
    """清理供应商模板缓存，供模板文件热更新或测试隔离使用。"""
    _load_raw.cache_clear()
