from __future__ import annotations

from contextvars import ContextVar, Token
from uuid import uuid4

_trace_id: ContextVar[str | None] = ContextVar("trace_id", default=None)


def new_trace_id(prefix: str = "trace") -> str:
    """生成带指定前缀的新追踪标识。

    参数:
        prefix: 追踪标识前缀，用于区分不同业务来源。

    返回:
        str: 由前缀和随机 UUID 组成的追踪标识。
    """
    return f"{prefix}_{uuid4().hex}"


def get_trace_id() -> str | None:
    """读取当前上下文中的追踪标识。

    返回:
        str | None: 当前上下文绑定的追踪标识；未设置时返回 ``None``。
    """
    return _trace_id.get()


def set_trace_id(trace_id: str | None) -> Token[str | None]:
    """在当前上下文中设置追踪标识。

    参数:
        trace_id: 要绑定到当前上下文的追踪标识，传入 ``None`` 表示清空值。

    返回:
        Token[str | None]: 可用于恢复旧值的上下文令牌。
    """
    return _trace_id.set(trace_id)


def reset_trace_id(token: Token[str | None]) -> None:
    """根据上下文令牌恢复之前的追踪标识。

    参数:
        token: ``set_trace_id`` 返回的上下文令牌。
    """
    _trace_id.reset(token)
