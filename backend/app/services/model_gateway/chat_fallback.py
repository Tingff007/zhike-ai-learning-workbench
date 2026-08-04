from __future__ import annotations

from collections.abc import Sequence

from app.core.tracing import get_trace_id
from app.services.model_gateway.runtime_types import ChatGenerationResult, GatewayProviderConfig


def local_fallback_answer(messages: Sequence[dict[str, str]], provider: str, error: str) -> str:
    """生成模型调用不可用时返回给用户的本地降级回答。

    参数:
        messages: 本次聊天请求的消息列表，用于提取最后一条用户问题。
        provider: 触发降级的模型供应商展示名称。
        error: 远端调用失败或供应商跳过的原因。

    返回:
        面向用户的本地降级提示文本。
    """
    user_message = next((message.get("content", "") for message in reversed(messages) if message.get("role") == "user"), "")
    return (
        f"模型网关暂时无法完成真实模型调用，已启用本地降级回答。供应商：{provider}；原因：{error}。\n\n"
        f"你的问题是：{user_message}\n\n"
        "建议检查模型供应商 API Key、Base URL、协议和配额配置。"
    )


def chunk_text(text: str, size: int = 18) -> list[str]:
    """把非流式降级回答拆成较小文本块以复用流式输出协议。

    参数:
        text: 待分块的完整文本。
        size: 单个文本块的最大字符数，必须大于 0。

    返回:
        按固定长度切分后的文本块列表；空文本返回空列表。

    异常:
        ValueError: 当分块大小小于或等于 0 时抛出。
    """
    if size <= 0:
        raise ValueError("文本分块大小必须大于 0")
    return [text[index : index + size] for index in range(0, len(text), size)] if text else []


def build_local_chat_fallback_result(
    *,
    messages: Sequence[dict[str, str]],
    config: GatewayProviderConfig,
    latency_ms: int,
    error: str,
) -> ChatGenerationResult:
    """根据供应商配置和错误原因构造本地降级聊天结果。

    参数:
        messages: 本次聊天请求的消息列表。
        config: 本次降级所基于的供应商运行时配置。
        latency_ms: 从开始尝试到进入降级路径的耗时。
        error: 触发本地降级的错误摘要。

    返回:
        可被普通聊天响应和流式完成事件复用的降级结果。
    """
    answer = local_fallback_answer(messages, provider=config.display_name, error=error)
    return ChatGenerationResult(
        answer=answer,
        provider=config.provider,
        display_name=config.display_name,
        model=config.chat_model,
        status="fallback",
        latency_ms=latency_ms,
        is_fallback=True,
        error=error,
        trace_id=get_trace_id(),
    )
