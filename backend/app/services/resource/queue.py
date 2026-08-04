from __future__ import annotations

import logging

import redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)

RESOURCE_GENERATE_QUEUE = "resource.generate"


def _redis_client() -> redis.Redis:
    """创建资源生成队列使用的 Redis 客户端。"""
    return redis.from_url(settings.VALKEY_URL, decode_responses=True)


def enqueue_resource_generation(task_id: str) -> bool:
    """将资源生成任务 ID 写入 Redis 队列。

    返回:
        入队成功返回 True；task_id 为空或 Redis 写入失败时返回 False。
    """
    if not task_id:
        return False
    try:
        _redis_client().lpush(RESOURCE_GENERATE_QUEUE, task_id)
        return True
    except RedisError:
        logger.warning(
            "资源生成任务入队失败，将返回失败状态：queue=%s task_id=%s",
            RESOURCE_GENERATE_QUEUE,
            task_id,
            exc_info=True,
        )
        return False


def dequeue_resource_generation(timeout_seconds: int = 1) -> str | None:
    """从 Redis 队列阻塞式取出一个资源生成任务 ID。

    参数:
        timeout_seconds: 最长阻塞等待秒数，小于 1 时按 1 秒处理。

    返回:
        取到任务时返回 task_id；超时或 Redis 读取失败时返回 None。
    """
    try:
        result = _redis_client().brpop(RESOURCE_GENERATE_QUEUE, timeout=max(1, timeout_seconds))
    except RedisError:
        logger.warning(
            "资源生成任务出队失败，将返回空任务：queue=%s timeout_seconds=%s",
            RESOURCE_GENERATE_QUEUE,
            max(1, timeout_seconds),
            exc_info=True,
        )
        return None
    if not result:
        return None
    _, task_id = result
    return str(task_id)
