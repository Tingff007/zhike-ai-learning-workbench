from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol


NO_TESTABLE_CAPABILITY_ERROR = "供应商未配置可测试的模型能力"


class HealthCheckConfig(Protocol):
    """健康检查纯函数需要的供应商运行时配置字段。"""

    provider_type: str
    chat_model: str | None
    embedding_model: str | None
    vision_model: str | None
    image_model: str | None


@dataclass(frozen=True, slots=True)
class ProviderHealthSummary:
    """单个供应商健康检查汇总结果。"""

    result_status: str
    health_status: str
    avg_latency_ms: int
    last_error: str | None


def resolve_health_check_capabilities(config: HealthCheckConfig, *, provider_chat_model: str | None = None) -> list[str]:
    """根据供应商类型和模型配置解析需要执行的健康检查能力。"""

    capabilities: list[str] = []
    if config.provider_type in {"embedding", "multimodal_embedding", "both"} and config.embedding_model:
        capabilities.append("embedding")
    if config.provider_type in {"vlm", "ocr"} and config.vision_model:
        capabilities.append("vision")
    if config.provider_type in {"image", "image_generation", "both"} and config.image_model:
        capabilities.append("image_generation")
    if config.provider_type == "rerank" and (config.chat_model or config.embedding_model):
        capabilities.append("rerank")
    if config.provider_type == "chat" and config.chat_model:
        capabilities.append("chat")
    elif config.provider_type == "both" and provider_chat_model:
        capabilities.append("chat")
    return capabilities


def health_check_model_name(config: HealthCheckConfig, capability: str) -> str | None:
    """按健康检查能力选择对外展示和日志记录使用的模型名。"""

    if capability == "embedding":
        return config.embedding_model
    if capability == "vision":
        return config.vision_model
    if capability == "image_generation":
        return config.image_model
    if capability == "rerank":
        return config.chat_model or config.embedding_model
    return config.chat_model


def health_check_success_agent_name(capability: str) -> str:
    """返回健康检查成功日志使用的 agent 名称。"""

    if capability == "embedding":
        return "Embedding connection test"
    if capability == "chat":
        return "Model gateway health check"
    return f"{capability} connection test"


def health_check_failure_agent_name(capability: str) -> str:
    """返回健康检查失败日志使用的 agent 名称，保持兼容旧日志展示。"""

    if capability == "embedding":
        return "Embedding connection test"
    if capability == "image_generation":
        return "Image generation connection test"
    return "Model gateway health check"


def lightweight_health_check_message(capability: str) -> str:
    """返回无需真实远程推理的轻量健康检查提示。"""

    return "图片生成供应商配置已就绪。" if capability == "image_generation" else "供应商配置已就绪。"


def build_passed_health_check(
    capability: str,
    *,
    latency_ms: int,
    model: str | None,
    message: str,
    embedding_dim: int | None = None,
) -> dict[str, Any]:
    """构造单项健康检查成功结果。"""

    return {
        "capability": capability,
        "status": "passed",
        "latency_ms": latency_ms,
        "model": model,
        "embedding_dim": embedding_dim,
        "message": message,
        "error": None,
    }


def build_failed_health_check(
    capability: str,
    *,
    latency_ms: int,
    model: str | None,
    error: str,
    embedding_dim: int | None = None,
) -> dict[str, Any]:
    """构造单项健康检查失败结果。"""

    return {
        "capability": capability,
        "status": "failed",
        "latency_ms": latency_ms,
        "model": model,
        "embedding_dim": embedding_dim,
        "message": None,
        "error": error,
    }


def summarize_health_checks(checks: Sequence[Mapping[str, Any]]) -> ProviderHealthSummary:
    """汇总多项健康检查结果，生成供应商状态和接口状态。"""

    passed_count = sum(1 for item in checks if item.get("status") == "passed")
    avg_latency_ms = round(sum(int(item.get("latency_ms") or 0) for item in checks) / len(checks)) if checks else 0
    errors = [str(item["error"]) for item in checks if item.get("error")]
    health_status = "healthy" if passed_count == len(checks) else "degraded" if passed_count else "unhealthy"
    result_status = "passed" if health_status == "healthy" else "degraded" if health_status == "degraded" else "failed"
    return ProviderHealthSummary(
        result_status=result_status,
        health_status=health_status,
        avg_latency_ms=avg_latency_ms,
        last_error="; ".join(errors)[:1000] if errors else None,
    )


def build_provider_health_result(
    *,
    provider_id: str,
    display_name: str,
    checks: Sequence[dict[str, Any]],
    summary: ProviderHealthSummary,
) -> dict[str, Any]:
    """构造管理端健康检查接口返回的供应商结果。"""

    return {
        "provider_id": provider_id,
        "display_name": display_name,
        "status": summary.result_status,
        "avg_latency_ms": summary.avg_latency_ms,
        "last_error": summary.last_error,
        "checks": list(checks),
    }


def build_no_capability_health_result(provider_id: str, display_name: str) -> dict[str, Any]:
    """构造无可测试能力时的健康检查结果。"""

    return {
        "provider_id": provider_id,
        "display_name": display_name,
        "status": "failed",
        "avg_latency_ms": 0,
        "last_error": NO_TESTABLE_CAPABILITY_ERROR,
        "checks": [],
    }
