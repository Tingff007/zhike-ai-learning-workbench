from __future__ import annotations

from typing import Any


def extract_chatdoc_scalar(payload: dict[str, Any], *keys: str) -> str:
    """从 ChatDoc 归一化响应或 raw 包装中提取标量 ID（如 repoId、fileId）。"""
    for key in keys:
        value = payload.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    data = payload.get("data")
    if isinstance(data, str) and data.strip():
        return data.strip()
    raw = payload.get("raw")
    if isinstance(raw, dict):
        for key in keys:
            value = raw.get(key)
            if value is not None and str(value).strip():
                return str(value).strip()
        inner = raw.get("data")
        if isinstance(inner, str) and inner.strip():
            return inner.strip()
    return ""
