from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Protocol

import sqlalchemy as sa
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Course, ModelCallLog
from app.services.model_gateway.errors import ModelGatewayBudgetLimitError


class BudgetProviderConfig(Protocol):
    """预算服务所需的供应商配置最小字段。"""

    id: Any | None
    daily_limit: int | None
    cost_config: dict[str, Any]


class ModelGatewayBudgetService:
    """封装模型网关的日额度、成本限制和单次调用费用估算。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def ensure_budget_available(self, config: BudgetProviderConfig, course_slug: str | None) -> None:
        """校验供应商和课程维度的日 Token / 成本额度。"""
        provider_limit = int(config.daily_limit or 0)
        course_limit = self.course_daily_token_limit(course_slug)
        provider_used = self.daily_token_usage(provider_id=config.id)
        if provider_limit and provider_used >= provider_limit:
            raise ModelGatewayBudgetLimitError(f"daily provider token limit exceeded: {provider_used}/{provider_limit}")
        course_used = self.daily_token_usage(course_slug=course_slug) if course_limit else 0
        if course_limit and course_used >= course_limit:
            raise ModelGatewayBudgetLimitError(f"daily course token limit exceeded: {course_used}/{course_limit}")
        daily_cost_limit = self.daily_cost_limit(config, course_slug)
        if daily_cost_limit and self.daily_estimated_cost(provider_id=config.id, course_slug=course_slug) >= daily_cost_limit:
            raise ModelGatewayBudgetLimitError(f"daily cost limit exceeded: {daily_cost_limit}")

    def course_daily_token_limit(self, course_slug: str | None) -> int | None:
        """读取课程级每日 Token 限制。"""
        course = self._course_by_slug_or_id(course_slug)
        if not course:
            return None
        config = course.model_config_json or {}
        value = config.get("daily_token_limit") or (config.get("cost_limits") or {}).get("daily_token_limit")
        return int(value) if value else None

    def daily_cost_limit(self, config: BudgetProviderConfig, course_slug: str | None) -> float | None:
        """读取供应商或课程级每日费用限制。"""
        provider_value = (config.cost_config or {}).get("daily_cost_limit")
        if provider_value:
            return float(provider_value)
        course = self._course_by_slug_or_id(course_slug)
        if not course:
            return None
        value = ((course.model_config_json or {}).get("cost_limits") or {}).get("daily_cost_limit")
        return float(value) if value else None

    def daily_token_usage(self, provider_id: Any | None = None, course_slug: str | None = None) -> int:
        """统计当天供应商或课程维度的 Token 用量。"""
        conditions = [ModelCallLog.created_at >= self._today_start()]
        if provider_id:
            conditions.append(ModelCallLog.provider_id == provider_id)
        course = self._course_by_slug_or_id(course_slug)
        if course:
            conditions.append(ModelCallLog.course_id == course.id)
        value = self.db.execute(select(func.sum(ModelCallLog.token_input + ModelCallLog.token_output)).where(*conditions)).scalar()
        return int(value or 0)

    def daily_estimated_cost(self, provider_id: Any | None = None, course_slug: str | None = None) -> float:
        """统计当天供应商或课程维度的预估成本。"""
        conditions = [ModelCallLog.created_at >= self._today_start()]
        if provider_id:
            conditions.append(ModelCallLog.provider_id == provider_id)
        course = self._course_by_slug_or_id(course_slug)
        if course:
            conditions.append(ModelCallLog.course_id == course.id)
        value = self.db.execute(
            select(func.sum(sa.cast(ModelCallLog.meta_json["estimated_cost"].astext, sa.Float))).where(*conditions)
        ).scalar()
        return float(value or 0)

    @staticmethod
    def estimate_call_cost(
        *,
        config: BudgetProviderConfig,
        capability: str,
        token_input: int,
        token_output: int,
        request_count: int,
    ) -> dict[str, Any]:
        """根据供应商计费配置估算单次调用成本。"""
        cost_config = config.cost_config or {}
        currency = str(cost_config.get("currency") or "CNY")
        if capability == "embedding":
            unit_price = float(cost_config.get("embedding_1k_token_price") or 0)
            estimated = (max(token_input, request_count) / 1000) * unit_price
        elif capability in {"image", "image_generation"}:
            unit_price = float(cost_config.get("image_unit_price") or cost_config.get("unit_price") or 0)
            estimated = max(request_count, 1) * unit_price
        else:
            input_price = float(cost_config.get("input_token_price") or 0)
            output_price = float(cost_config.get("output_token_price") or 0)
            estimated = (token_input / 1000) * input_price + (token_output / 1000) * output_price
        return {"currency": currency, "estimated_cost": round(estimated, 6)}

    def _course_by_slug_or_id(self, course_slug: str | None) -> Course | None:
        """按 slug 或 UUID 文本查找课程。"""
        if not course_slug:
            return None
        return self.db.execute(
            select(Course).where(or_(Course.slug == course_slug, Course.id == self._safe_uuid_text(course_slug)))
        ).scalar_one_or_none()

    @staticmethod
    def _today_start() -> datetime:
        """返回今天 UTC 零点的 naive datetime，保持与旧统计逻辑一致。"""
        return datetime.now(timezone.utc).replace(tzinfo=None, hour=0, minute=0, second=0, microsecond=0)

    @staticmethod
    def _safe_uuid_text(value: str) -> str:
        """将可能的 UUID 文本规范化，非法值返回永不命中的空 UUID。"""
        try:
            import uuid

            return str(uuid.UUID(str(value)))
        except (TypeError, ValueError):
            return "00000000-0000-0000-0000-000000000000"
