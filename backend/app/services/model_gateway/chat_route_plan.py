from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from app.services.model_gateway.runtime_types import GatewayProviderConfig


@dataclass(slots=True)
class ChatRoutePlan:
    """聊天调用的候选供应商计划。"""

    candidates: list[GatewayProviderConfig]
    fallback_base: GatewayProviderConfig


def build_chat_route_plan(
    candidates: Sequence[GatewayProviderConfig],
    *,
    env_default_config: Callable[[], GatewayProviderConfig],
    allow_fallback: bool,
) -> ChatRoutePlan:
    """根据候选供应商和回退开关生成一次聊天调用的路由计划。

    参数:
        candidates: 已按优先级排好的供应商候选列表。
        env_default_config: 数据库未配置供应商时的环境变量兜底配置工厂。
        allow_fallback: 是否允许继续尝试后续候选供应商。

    返回:
        包含实际候选链和本地降级基准供应商的路由计划。
    """

    planned_candidates = list(candidates)
    if not planned_candidates:
        planned_candidates = [env_default_config()]
    if not allow_fallback:
        planned_candidates = planned_candidates[:1]
    return ChatRoutePlan(candidates=planned_candidates, fallback_base=planned_candidates[0])


def build_chat_attempt_meta(
    *,
    attempt_index: int,
    failed_attempts: Sequence[dict[str, str]] = (),
    skipped_attempts: Sequence[dict[str, str]] = (),
    stream_mode: str | None = None,
    fallback_to_next: bool | None = None,
) -> dict[str, Any]:
    """构造聊天调用日志中的尝试元数据。

    参数:
        attempt_index: 从 1 开始的候选供应商尝试序号。
        failed_attempts: 当前成功前已经失败的供应商摘要。
        skipped_attempts: 因冷却或健康状态跳过的供应商摘要。
        stream_mode: 流式调用的输出模式。
        fallback_to_next: 失败后是否继续回退到下一个供应商。

    返回:
        可直接写入模型调用日志的元数据字典。
    """

    meta_json: dict[str, Any] = {"attempt_index": attempt_index}
    if stream_mode:
        meta_json["stream_mode"] = stream_mode
    if failed_attempts:
        meta_json["fallback_from"] = [item["provider"] for item in failed_attempts if item.get("provider")]
    if skipped_attempts:
        meta_json["skipped_providers"] = list(skipped_attempts)
    if fallback_to_next is not None:
        meta_json["fallback_to_next"] = fallback_to_next
    return meta_json
