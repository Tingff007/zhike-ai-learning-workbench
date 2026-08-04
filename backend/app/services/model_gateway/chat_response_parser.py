from __future__ import annotations

import json
import logging
from typing import Any


logger = logging.getLogger(__name__)


def extract_chat_answer(data: dict[str, Any]) -> str:
    """从 OpenAI 兼容响应中提取聊天正文。

    参数:
        data: 模型供应商返回的 JSON 字典，通常包含 choices[0].message.content。

    返回:
        去除首尾空白后的回答文本；当响应结构不符合预期时，返回截断后的原始 JSON，
        以便调用方仍能保留可观测的失败上下文。
    """
    try:
        return str(data["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError) as exc:
        logger.debug("模型响应未匹配 OpenAI choices 格式，返回原始 JSON 片段: %s", exc, exc_info=True)
        return json.dumps(data, ensure_ascii=False)[:2000]


def extract_sse_delta(line: str) -> str | None:
    """从 OpenAI 兼容 SSE 行中提取增量文本。

    参数:
        line: 单行 SSE 文本，预期格式为 ``data: {...}``。

    返回:
        当前事件携带的文本片段；非 data 行、结束标记或无法解析的事件返回 ``None``。
    """
    stripped_line = line.strip()
    if not stripped_line or not stripped_line.startswith("data:"):
        return None
    payload = stripped_line.removeprefix("data:").strip()
    if payload == "[DONE]":
        return None
    try:
        data = json.loads(payload)
        choice = data.get("choices", [{}])[0]
        delta = choice.get("delta", {})
        content = delta.get("content") or choice.get("message", {}).get("content")
        return content if isinstance(content, str) else None
    except (json.JSONDecodeError, KeyError, IndexError, TypeError, AttributeError) as exc:
        logger.debug("解析 SSE delta 失败，忽略该行: %s", exc, exc_info=True)
        return None
