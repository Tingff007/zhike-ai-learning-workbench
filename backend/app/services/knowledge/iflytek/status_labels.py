from __future__ import annotations

from typing import TypedDict


class _ChatdocPipelineStage(TypedDict):
    """描述 ChatDoc 入库流程中一个可展示的阶段。"""

    key: str
    label: str
    hint: str


CHATDOC_FILE_STATUS_ORDER: tuple[str, ...] = (
    "uploaded",
    "texted",
    "ocring",
    "spliting",
    "split",
    "splited",
    "vectoring",
    "vectored",
    "failed",
)

CHATDOC_FILE_STATUS_LABELS: dict[str, str] = {
    "uploaded": "已上传",
    "texted": "已文本化",
    "ocring": "OCR 识别中",
    "spliting": "切分中",
    "split": "切分中",
    "splited": "已切分",
    "vectoring": "向量化中",
    "vectored": "已向量化",
    "failed": "失败",
}

CHATDOC_PIPELINE_STAGES: tuple[_ChatdocPipelineStage, ...] = (
    {"key": "uploaded", "label": "已上传", "hint": "file/upload"},
    {"key": "texted", "label": "已解析", "hint": "TEXT / OCR"},
    {"key": "splited", "label": "已切分", "hint": "wiki 分段"},
    {"key": "vectoring", "label": "向量化", "hint": "embedding"},
    {"key": "vectored", "label": "可检索", "hint": "vector/search"},
)


def normalize_chatdoc_file_status(value: str | None) -> str:
    """标准化讯飞 ChatDoc fileStatus，便于后续比较。

    参数:
        value: 原始 fileStatus，允许为空。

    返回:
        去除首尾空白并转为小写后的状态字符串。
    """
    return (value or "").strip().lower()


def chatdoc_file_status_index(status: str | None) -> int:
    """返回 fileStatus 在入库状态顺序中的位置。

    参数:
        status: 原始或已标准化的 ChatDoc fileStatus。

    返回:
        命中时返回状态序号，未知状态返回 -1。
    """
    normalized = normalize_chatdoc_file_status(status)
    aliases = {"split": "spliting", "splited": "splited"}
    normalized = aliases.get(normalized, normalized)
    try:
        return CHATDOC_FILE_STATUS_ORDER.index(normalized)
    except ValueError:
        return -1


def chatdoc_file_status_label(status: str | None) -> str:
    """返回 fileStatus 面向界面的中文标签。

    参数:
        status: 原始或已标准化的 ChatDoc fileStatus。

    返回:
        已知状态返回中文标签，未知状态返回标准化状态或“未知”。
    """
    normalized = normalize_chatdoc_file_status(status)
    return CHATDOC_FILE_STATUS_LABELS.get(normalized, normalized or "未知")


def chatdoc_pipeline_step_index(file_status: str | None) -> int:
    """把 fileStatus 映射到前端入库漏斗阶段序号。

    参数:
        file_status: 讯飞 ChatDoc 返回的 fileStatus。

    返回:
        漏斗阶段序号；失败状态返回 -1，未知状态按上传阶段处理。
    """
    normalized = normalize_chatdoc_file_status(file_status)
    if normalized in {"failed"}:
        return -1
    if normalized in {"vectored"}:
        return 4
    if normalized in {"vectoring"}:
        return 3
    if normalized in {"spliting", "split", "splited"}:
        return 2
    if normalized in {"texted", "ocring"}:
        return 1
    if normalized in {"uploaded"}:
        return 0
    return 0
