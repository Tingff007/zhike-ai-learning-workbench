from __future__ import annotations

from datetime import datetime, timedelta, timezone

NON_RETRYABLE_ERROR_MARKERS = (
    "源文件不存在",
    "permission",
    "forbidden",
    "unauthorized",
    "invalid format",
    "unsupported",
)
RETRYABLE_ERROR_MARKERS = (
    "timeout",
    "timed out",
    "connection",
    "network",
    "rate limit",
    "429",
    "502",
    "503",
    "504",
    "temporarily",
    "temporary",
    "service unavailable",
    "限流",
    "网络",
    "超时",
    "暂时",
    "连接",
    "供应商",
)


def utcnow() -> datetime:
    """返回带 UTC 时区信息的当前时间。

    返回:
        当前 UTC 时间，tzinfo 固定为 timezone.utc。

    副作用与失败模式:
        本函数不产生副作用，通常不抛出异常。
    """

    return datetime.now(timezone.utc)


def retry_delay_seconds(attempt_count: int, *, base_seconds: int = 30, max_seconds: int = 900) -> int:
    """根据重试次数计算指数退避等待秒数。

    参数:
        attempt_count: 当前尝试次数，小于 1 或空值会按 1 处理。
        base_seconds: 第一次重试的基础等待秒数。
        max_seconds: 返回值允许的最大等待秒数。

    返回:
        受 max_seconds 限制后的退避等待秒数。

    副作用与失败模式:
        本函数不产生副作用；attempt_count 会转换为整数，无法转换时由调用方承担异常。
    """

    attempt = max(1, int(attempt_count or 1))
    return min(max_seconds, base_seconds * (2 ** (attempt - 1)))


def is_retryable_task_error(message: str | None) -> bool:
    """判断任务错误信息是否适合自动重试。

    参数:
        message: 任务失败消息，允许为空。

    返回:
        如果错误信息命中可重试标记且未命中不可重试标记，则返回 True。

    副作用与失败模式:
        本函数不产生副作用；空消息会直接返回 False。
    """

    text = str(message or "").lower()
    if not text:
        return False
    if any(marker.lower() in text for marker in NON_RETRYABLE_ERROR_MARKERS):
        return False
    return any(marker.lower() in text for marker in RETRYABLE_ERROR_MARKERS)


def lease_expired(
    *,
    heartbeat_at: datetime | None,
    locked_at: datetime | None,
    timeout_seconds: int | None,
    now: datetime | None = None,
) -> bool:
    """判断后台任务租约是否已经过期。

    参数:
        heartbeat_at: 最近一次心跳时间，优先作为租约判断依据。
        locked_at: 任务加锁时间，在没有心跳时作为判断依据。
        timeout_seconds: 租约超时时间；空值会使用默认值，并至少保留 60 秒。
        now: 当前时间，主要供测试注入；为空时使用当前 UTC 时间。

    返回:
        如果没有可用参考时间，或参考时间早于超时边界，则返回 True。

    副作用与失败模式:
        本函数不产生副作用；无时区时间会按 UTC 解释。
    """

    now = now or utcnow()
    timeout = max(60, int(timeout_seconds or 900))
    reference = heartbeat_at or locked_at
    if reference is None:
        return True
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)
    return reference <= now - timedelta(seconds=timeout)
