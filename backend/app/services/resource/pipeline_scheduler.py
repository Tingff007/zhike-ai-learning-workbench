from __future__ import annotations

import asyncio
import logging

from app.core.config import settings
from app.services.resource.task_worker import ResourceGenerationWorker


logger = logging.getLogger(__name__)


async def resource_generation_scheduler() -> None:
    """持续调度资源生成 worker，并在空闲或失败时按配置间隔等待。"""
    if not settings.RESOURCE_GENERATION_WORKER_ENABLED:
        logger.info("资源生成调度器已被配置关闭")
        return
    poll_interval = max(0.5, float(settings.RESOURCE_GENERATION_POLL_INTERVAL_SECONDS))
    worker = ResourceGenerationWorker(poll_interval_seconds=poll_interval)
    while True:
        try:
            result = await worker.run_once()
            if result.get("status") == "idle":
                await asyncio.sleep(poll_interval)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("资源生成调度器单轮执行失败，将等待后继续")
            await asyncio.sleep(poll_interval)
