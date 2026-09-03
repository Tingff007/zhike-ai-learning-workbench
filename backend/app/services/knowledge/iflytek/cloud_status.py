"""把讯飞 ChatDoc fileStatus 映射为本地文档字段。"""

from __future__ import annotations

from app.core.config import settings
from app.services.knowledge.iflytek.status_labels import normalize_chatdoc_file_status

# 分步入库停在 splited 阶段时使用的业务 vector_status。
PENDING_ACTIVATION_VECTOR_STATUS: str = "pending_activation"
AWAITING_PUBLISH_READINESS: str = "awaiting_activation"


def chatdoc_step_by_step_enabled() -> bool:
    """读取当前是否启用 ChatDoc 分步入库模式。

    返回:
        配置项启用时返回 True，否则返回 False。
    """
    return bool(settings.CHATDOC_STEP_BY_STEP)


def map_chatdoc_status(file_status: str | None, *, step_by_step: bool | None = None) -> tuple[str, str, str]:
    """把 ChatDoc fileStatus 映射为本地文档状态三元组。

    参数:
        file_status: 讯飞 ChatDoc 返回的 fileStatus。
        step_by_step: 可选的分步入库开关；为空时读取运行时配置。

    返回:
        按顺序返回解析状态、向量状态和发布就绪状态。
    """
    step_mode = chatdoc_step_by_step_enabled() if step_by_step is None else step_by_step
    normalized = normalize_chatdoc_file_status(file_status)
    if not normalized:
        return "processing", "processing", "blocked"

    if normalized == "failed":
        return "failed", "failed", "blocked"

    if normalized == "vectored":
        return "completed", "ready", "ready"

    if normalized == "vectoring":
        return "completed", "processing", "blocked"

    if normalized in {"splited", "spliting", "split"}:
        if step_mode and normalized == "splited":
            return "completed", PENDING_ACTIVATION_VECTOR_STATUS, AWAITING_PUBLISH_READINESS
        return "processing", "pending", "blocked"

    if normalized in {"texted", "ocring", "uploaded"}:
        return "processing", "pending", "blocked"

    return "processing", "processing", "blocked"


def is_awaiting_activation(vector_status: str | None, file_status: str | None = None) -> bool:
    """判断文档是否停在等待手动触发向量化的阶段。

    参数:
        vector_status: 本地记录的向量化状态。
        file_status: 可选的 ChatDoc fileStatus，用于兼容只保存云端状态的场景。

    返回:
        需要手动激活向量化时返回 True。
    """
    if vector_status == PENDING_ACTIVATION_VECTOR_STATUS:
        return True
    return chatdoc_step_by_step_enabled() and normalize_chatdoc_file_status(file_status) == "splited"


def can_trigger_embedding(vector_status: str | None, file_status: str | None = None) -> bool:
    """判断当前状态是否允许触发向量化。

    参数:
        vector_status: 本地记录的向量化状态。
        file_status: 可选的 ChatDoc fileStatus。

    返回:
        可以触发向量化时返回 True。
    """
    return is_awaiting_activation(vector_status, file_status)


def can_trigger_extract(file_status: str | None) -> bool:
    """判断当前云端状态是否允许抽取内容。

    参数:
        file_status: 讯飞 ChatDoc 返回的 fileStatus。

    返回:
        fileStatus 为 vectored 时返回 True。
    """
    return normalize_chatdoc_file_status(file_status) == "vectored"


def cloud_status_label(file_status: str | None) -> str:
    """返回云端状态的稳定展示标签。

    参数:
        file_status: 讯飞 ChatDoc 返回的 fileStatus。

    返回:
        标准化后的状态；为空时返回 unknown。
    """
    return normalize_chatdoc_file_status(file_status) or "unknown"
