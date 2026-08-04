from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.tracing import get_trace_id
from app.models import ModelProviderHealth


logger = logging.getLogger(__name__)


class HealthProviderRecord(Protocol):
    """模型供应商健康状态服务需要的最小供应商字段。"""

    id: Any
    provider: str
    health_status: str
    last_checked_at: datetime | None


class HealthProviderConfig(Protocol):
    """路由冷却判断需要的最小供应商配置字段。"""

    id: Any | None
    provider: str


class ModelGatewayHealthService:
    """封装模型供应商健康状态写入、初始化和冷却判断。"""

    def __init__(self, db: Session) -> None:
        """初始化健康状态服务。

        参数:
            db: 当前请求或后台任务使用的数据库会话。
        """
        self.db = db

    def ensure_health_row(self, provider: HealthProviderRecord) -> None:
        """确保供应商至少存在一条健康状态记录。"""

        health = self._health_row(provider.id)
        if not health:
            self.db.add(
                ModelProviderHealth(
                    provider_id=provider.id,
                    status=provider.health_status,
                    success_rate=1.0,
                    avg_latency_ms=0,
                    consecutive_failures=0,
                )
            )

    def update_provider_health(self, provider: HealthProviderRecord, status: str, latency_ms: int, error: str | None) -> None:
        """更新供应商健康状态，并在连续失败达到阈值时标记为 down。"""

        try:
            next_status = status if status in {"healthy", "degraded", "down", "standby", "unhealthy"} else provider.health_status
            provider.last_checked_at = self._utcnow_naive()
            health = self._health_row(provider.id)
            if not health:
                health = ModelProviderHealth(
                    provider_id=provider.id,
                    status=next_status,
                    success_rate=1.0,
                    avg_latency_ms=0,
                    consecutive_failures=0,
                )
                self.db.add(health)
                self.db.flush()
            health.avg_latency_ms = latency_ms
            health.last_error = error[:1000] if error else None
            health.consecutive_failures = 0 if not error else health.consecutive_failures + 1
            if error and health.consecutive_failures >= settings.MODEL_GATEWAY_FAILURE_THRESHOLD:
                next_status = "down"
            health.status = next_status
            health.success_rate = 0.98 if not error else max(0.1, health.success_rate - 0.05)
            provider.health_status = next_status
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.warning(
                "更新模型供应商健康状态失败：provider=%s status=%s trace_id=%s",
                provider.provider,
                status,
                get_trace_id(),
                exc_info=True,
            )

    def is_config_in_cooldown(self, config: HealthProviderConfig) -> bool:
        """判断供应商配置是否仍处于失败冷却窗口。"""

        if not config.id:
            return False
        health = self._health_row(config.id)
        if not health or health.consecutive_failures < settings.MODEL_GATEWAY_FAILURE_THRESHOLD:
            return False
        checked_at = self._naive_utc(health.updated_at or health.created_at)
        if not checked_at:
            return True
        return self._utcnow_naive() - checked_at < timedelta(seconds=settings.MODEL_GATEWAY_HEALTH_COOLDOWN_SECONDS)

    def is_provider_unhealthy_for_routing(self, config: HealthProviderConfig) -> bool:
        """判断供应商是否因不健康状态需要从路由链路中跳过。"""

        if not config.id:
            return False
        health = self._health_row(config.id)
        return bool(health and health.status in {"unhealthy", "down"} and self.is_config_in_cooldown(config))

    def _health_row(self, provider_id: Any) -> ModelProviderHealth | None:
        """读取供应商健康状态记录。"""

        return self.db.execute(select(ModelProviderHealth).where(ModelProviderHealth.provider_id == provider_id)).scalar_one_or_none()

    @staticmethod
    def _naive_utc(value: datetime | None) -> datetime | None:
        """将带时区时间转换为 UTC naive datetime，兼容旧数据库字段。"""

        if value is None:
            return None
        if value.tzinfo:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    @staticmethod
    def _utcnow_naive() -> datetime:
        """返回当前 UTC naive datetime。"""

        return datetime.now(timezone.utc).replace(tzinfo=None)
