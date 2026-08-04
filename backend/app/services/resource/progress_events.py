from __future__ import annotations

import json
import logging
from typing import Any

import redis

from app.core.config import settings

logger = logging.getLogger(__name__)


def _redis_client() -> redis.Redis:
    return redis.from_url(settings.VALKEY_URL, decode_responses=True)


def resource_task_progress_channel(task_id: str) -> str:
    """生成资源任务进度事件的 Redis pub/sub 频道名。"""
    return f"{settings.RESOURCE_TASK_PROGRESS_CHANNEL_PREFIX}{task_id}"


def publish_resource_task_progress(task_id: str, payload: dict[str, Any]) -> bool:
    """把资源生成快照发布到 Redis pub/sub，供 WebSocket 订阅端消费。"""
    if not task_id:
        return False
    try:
        message = json.dumps(
            {
                "type": "resource_generation_progress",
                "event": "resource_task_status",
                **payload,
            },
            ensure_ascii=False,
        )
        _redis_client().publish(resource_task_progress_channel(task_id), message)
        return True
    except Exception:
        logger.warning(
            "资源生成进度事件发布失败，将跳过本次推送：task_id=%s channel=%s",
            task_id,
            resource_task_progress_channel(task_id),
            exc_info=True,
        )
        return False
