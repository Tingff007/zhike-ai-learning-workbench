from __future__ import annotations

from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState


def ws_is_connected(websocket: WebSocket) -> bool:
    """判断 WebSocket 客户端连接是否仍处于已连接状态。

    参数:
        websocket: 需要检查连接状态的 WebSocket 实例。

    返回:
        bool: 客户端连接状态为已连接时返回 ``True``。
    """
    return websocket.client_state == WebSocketState.CONNECTED


async def ws_send_json(websocket: WebSocket, payload: dict[str, Any]) -> bool:
    """在连接有效时安全发送 JSON 消息。

    参数:
        websocket: 目标 WebSocket 连接。
        payload: 需要发送的 JSON 字典载荷。

    返回:
        bool: 发送成功返回 ``True``；连接关闭或发送失败时返回 ``False``。
    """
    if not ws_is_connected(websocket):
        return False
    try:
        await websocket.send_json(payload)
        return True
    except (RuntimeError, WebSocketDisconnect):
        return False


async def ws_close(websocket: WebSocket, *, code: int = 1000, reason: str = "") -> None:
    """在连接有效时安全关闭 WebSocket。

    参数:
        websocket: 需要关闭的 WebSocket 连接。
        code: WebSocket 关闭码。
        reason: 关闭原因，默认不发送额外说明。
    """
    if not ws_is_connected(websocket):
        return
    try:
        await websocket.close(code=code, reason=reason)
    except (RuntimeError, WebSocketDisconnect):
        return
