from __future__ import annotations

from typing import Any

import sqlalchemy as sa
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Course


_COURSE_PROVIDER_CONFIG_KEYS = (
    "chat_provider",
    "embedding_provider",
    "text_embedding_provider",
    "multimodal_embedding_provider",
    "rerank_provider",
    "vlm_provider",
    "ocr_provider",
    "image_provider",
)

_PROVIDER_RELATED_CONFIG_KEYS: dict[str, tuple[str, ...]] = {
    "embedding_provider": ("embedding_model", "embedding_dimension"),
    "text_embedding_provider": ("text_embedding_model", "text_embedding_dimension"),
    "multimodal_embedding_provider": ("multimodal_embedding_model", "multimodal_embedding_dimension"),
    "rerank_provider": ("rerank_model",),
}


class ModelGatewayCourseBindingService:
    """管理课程模型配置和模型供应商之间的绑定关系。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def resolve_chat_provider(self, course_slug: str | None) -> str | None:
        """解析课程绑定的聊天供应商编码。"""
        course = self._course_by_slug_or_id(course_slug)
        if not course:
            return None
        value = (course.model_config_json or {}).get("chat_provider")
        provider_code = str(value).strip() if value else ""
        return provider_code or None

    def clear_provider_bindings(self, provider_code: str) -> int:
        """删除供应商前清理课程配置中指向该供应商的绑定。"""
        provider_code = provider_code.strip()
        if not provider_code:
            return 0

        rows = (
            self.db.execute(
                select(Course).where(sa.cast(Course.model_config_json, sa.Text).like(f"%{provider_code}%"))
            )
            .scalars()
            .all()
        )
        cleared = 0
        for course in rows:
            config = dict(course.model_config_json or {})
            if not self._remove_provider_from_config(config, provider_code):
                continue
            course.model_config_json = config
            cleared += 1
        return cleared

    def _course_by_slug_or_id(self, course_slug: str | None) -> Course | None:
        """按课程 slug 或 UUID 文本查询课程。"""
        if not course_slug:
            return None
        return self.db.execute(
            select(Course).where(or_(Course.slug == course_slug, Course.id == self._safe_uuid_text(course_slug)))
        ).scalar_one_or_none()

    @staticmethod
    def _remove_provider_from_config(config: dict[str, Any], provider_code: str) -> bool:
        """从单个课程模型配置中移除供应商引用及其派生模型字段。"""
        touched = False
        for key in _COURSE_PROVIDER_CONFIG_KEYS:
            if config.get(key) != provider_code:
                continue
            config.pop(key, None)
            touched = True
            for related in _PROVIDER_RELATED_CONFIG_KEYS.get(key, ()):
                config.pop(related, None)

        if touched and not config.get("embedding_provider") and not config.get("text_embedding_provider"):
            config["use_global_embedding"] = True
        return touched

    @staticmethod
    def _safe_uuid_text(value: str) -> str:
        """将可能的 UUID 文本规范化，非法值返回永不命中的空 UUID。"""
        try:
            import uuid

            return str(uuid.UUID(str(value)))
        except (TypeError, ValueError):
            return "00000000-0000-0000-0000-000000000000"
