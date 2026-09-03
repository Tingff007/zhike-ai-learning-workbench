from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Protocol


_IMAGE_PROVIDER_TYPES = frozenset({"image", "image_generation"})


class ProviderPayloadLike(Protocol):
    """供应商保存草稿转换所需的最小 payload 契约。"""

    image_model: str | None

    def model_dump(self, *, exclude: set[str]) -> dict[str, Any]:
        """导出可写入 ModelProvider 的字段字典。"""
        ...


def resolve_image_model(
    *,
    provider_type: str | None,
    meta_json: Mapping[str, Any] | None,
    vision_model: str | None,
    chat_model: str | None,
) -> str | None:
    """解析供应商实际用于图片生成的模型名称。

    优先使用 meta_json.image_model，其次复用视觉模型；图片生成专用供应商允许
    继续回退到 chat_model，以兼容历史模板只填写 chat_model 的情况。
    """
    meta = meta_json or {}
    raw_image_model = meta.get("image_model") or vision_model
    if provider_type in _IMAGE_PROVIDER_TYPES:
        raw_image_model = raw_image_model or chat_model
    return str(raw_image_model or "").strip() or None


def provider_values_from_payload(payload: ProviderPayloadLike) -> dict[str, Any]:
    """将供应商表单 payload 转为 ModelProvider 可持久化字段。

    image_model 不直接写入 ModelProvider 表字段，而是合并进 meta_json，保证
    运行时配置、管理端列表和历史模板读取同一份扩展字段。
    """
    values = payload.model_dump(exclude={"provider", "api_key", "clear_api_key", "image_model"})
    if payload.image_model:
        values["meta_json"] = {**dict(values.get("meta_json") or {}), "image_model": payload.image_model}
    return values
