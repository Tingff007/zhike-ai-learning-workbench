from __future__ import annotations

import asyncio
import logging

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.tracing import new_trace_id, reset_trace_id, set_trace_id
from app.services.model_gateway.router import ModelGateway

logger = logging.getLogger(__name__)


async def model_gateway_health_scheduler() -> None:
    """周期性探测启用中的模型供应商，并与配置热重载保持解耦。"""
    interval = max(60, int(settings.MODEL_GATEWAY_HEALTH_CHECK_INTERVAL_SECONDS))
    while True:
        await asyncio.sleep(interval)
        trace_id = new_trace_id("health")
        token = set_trace_id(trace_id)
        db = SessionLocal()
        try:
            await ModelGateway(db).check_all_providers(actor_external_id=None, audit=False)
        except Exception:
            logger.warning(
                "模型网关健康巡检失败，本轮将跳过：trace_id=%s interval_seconds=%s",
                trace_id,
                interval,
                exc_info=True,
            )
            db.rollback()
        finally:
            db.close()
            reset_trace_id(token)
