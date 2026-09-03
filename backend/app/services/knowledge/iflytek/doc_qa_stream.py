from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import urlencode

import websockets
from websockets.exceptions import WebSocketException

from app.services.knowledge.iflytek.chatdoc_auth import chatdoc_signature
from app.services.knowledge.iflytek.client import IflytekChatDocClient, IflytekChatDocError
from app.services.knowledge.iflytek.pipeline_config import doc_qa_payload_from_pipeline

CHATDOC_WS_PATH = "/openapi/chat"


def build_chatdoc_ws_url(client: IflytekChatDocClient) -> str:
    """构建携带 ChatDoc 鉴权参数的 WebSocket URL。

    参数:
        client: 已加载讯飞 ChatDoc 凭证的客户端实例。

    返回:
        可直接连接的 ChatDoc WebSocket 地址。

    异常:
        IflytekChatDocError: 当客户端缺少必要凭证时抛出。
    """
    if not client.configured:
        raise IflytekChatDocError("讯飞 ChatDoc 凭证未配置")
    app_id, timestamp, signature = chatdoc_signature(client.app_id, client.api_secret)
    query = urlencode({"appId": app_id, "timestamp": timestamp, "signature": signature})
    return f"wss://chatdoc.xfyun.cn{CHATDOC_WS_PATH}?{query}"


def extract_chatdoc_text_delta(raw_message: str) -> str | None:
    """尽力把 ChatDoc 流式帧解析为答案文本增量。

    参数:
        raw_message: WebSocket 收到的原始文本帧。

    返回:
        解析出的文本增量；无法识别或为空时返回 None。
    """
    text = (raw_message or "").strip()
    if not text:
        return None
    if not text.startswith("{"):
        return text

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return text

    if isinstance(data, dict):
        for key in ("content", "answer", "text", "delta"):
            value = data.get(key)
            if isinstance(value, str) and value:
                return value

        payload = data.get("payload")
        if isinstance(payload, dict):
            choices = payload.get("choices")
            if isinstance(choices, dict):
                text_items = choices.get("text")
                if isinstance(text_items, list) and text_items:
                    first = text_items[0]
                    if isinstance(first, dict):
                        chunk = first.get("content") or first.get("text")
                        if isinstance(chunk, str) and chunk:
                            return chunk
                    if isinstance(first, str) and first:
                        return first

        data_field = data.get("data")
        if isinstance(data_field, str) and data_field:
            return data_field
        if isinstance(data_field, dict):
            inner = data_field.get("content") or data_field.get("answer")
            if isinstance(inner, str) and inner:
                return inner

    return None


def is_chatdoc_terminal_message(raw_message: str) -> bool:
    """判断 ChatDoc 流式帧是否表示问答终态。

    参数:
        raw_message: WebSocket 收到的原始文本帧。

    返回:
        当帧中包含完成状态或非零错误码时返回 True。
    """
    text = (raw_message or "").strip()
    if not text.startswith("{"):
        return False
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return False
    if not isinstance(data, dict):
        return False
    header = data.get("header")
    if isinstance(header, dict):
        status = header.get("status")
        if status in {2, "2", "completed", "done"}:
            return True
        code = header.get("code")
        if code not in (None, 0, "0"):
            return True
    # 顶层错误码没有 header 包装时，也视为终态消息。
    code = data.get("code")
    if code not in (None, 0, "0"):
        return True
    status = data.get("status")
    return status in {"completed", "done", "end", 2, "2"}


def _chatdoc_error_message(raw_message: str) -> str | None:
    """提取 ChatDoc 业务错误信息。

    参数:
        raw_message: WebSocket 收到的原始文本帧。

    返回:
        当 code 或 header.code 非零时返回错误文本；正常消息返回 None。
    """
    text = (raw_message or "").strip()
    if not text.startswith("{"):
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    # 检查没有 header 包装的顶层 code。
    code = data.get("code")
    if code not in (None, 0, "0"):
        msg = data.get("message") or data.get("content") or data.get("desc") or f"ChatDoc error (code={code})"
        return str(msg).strip()
    # 检查 header.code。
    header = data.get("header")
    if isinstance(header, dict):
        code = header.get("code")
        if code not in (None, 0, "0"):
            msg = header.get("message") or data.get("message") or f"ChatDoc error (code={code})"
            return str(msg).strip()
    return None


async def stream_chatdoc_doc_qa(
    client: IflytekChatDocClient,
    *,
    pipeline_config: dict[str, Any] | None,
    file_id: str,
    query: str,
) -> AsyncIterator[str]:
    """代理 ChatDoc 原生 WebSocket 问答，并向前端输出文本增量。

    参数:
        client: 已加载讯飞 ChatDoc 凭证的客户端实例。
        pipeline_config: 当前集成模板的问答 pipeline 配置。
        file_id: ChatDoc 已向量化文档的 fileId。
        query: 用户问题文本。

    返回:
        异步文本增量迭代器。

    异常:
        IflytekChatDocError: 当 WebSocket 连接或通信失败时抛出。
    """
    payload = doc_qa_payload_from_pipeline(pipeline_config, file_id=file_id, query=query)
    url = build_chatdoc_ws_url(client)

    try:
        async with websockets.connect(url, open_timeout=30, close_timeout=5) as xf_ws:
            await xf_ws.send(json.dumps(payload, ensure_ascii=False))
            async for message in xf_ws:
                if isinstance(message, bytes):
                    message = message.decode("utf-8", errors="replace")
                if is_chatdoc_terminal_message(message):
                    err_msg = _chatdoc_error_message(message)
                    if err_msg:
                        # 业务错误（如 62001 无内容）属于有效 API 响应，将错误信息作为答案文本返回。
                        yield err_msg
                        break
                    final_delta = extract_chatdoc_text_delta(message)
                    if final_delta:
                        yield final_delta
                    break
                delta = extract_chatdoc_text_delta(message)
                if delta:
                    yield delta
    except WebSocketException as exc:
        raise IflytekChatDocError(f"讯飞文档问答 WebSocket 连接失败：{exc}") from exc
