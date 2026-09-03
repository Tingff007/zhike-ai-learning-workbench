from __future__ import annotations

from typing import Any, Mapping


STEP_BY_STEP_UPLOAD_MESSAGE = (
    "文档已提交云端解析与切分。切分完成后将进入「待授权入库」，"
    "请在文档表中勾选并点击「批量向量化激活」。"
)
DEFAULT_UPLOAD_MESSAGE = "文档已提交云端知识库解析、切片与向量化，请稍候刷新状态。"


def build_chatdoc_upload_payload(
    record: Mapping[str, Any],
    chatdoc: Mapping[str, Any],
) -> dict[str, Any]:
    """合并本地文档记录和 ChatDoc 上传结果，生成上传接口响应。

    参数:
        record: 本地文档登记流程返回的响应字段。
        chatdoc: 讯飞 ChatDoc 上传服务返回的云端文件与仓库信息。

    返回:
        面向管理端上传接口的响应字典，保留本地记录字段并补充云端状态字段。
    """
    step_by_step = bool(chatdoc.get("step_by_step"))
    message = STEP_BY_STEP_UPLOAD_MESSAGE if step_by_step else DEFAULT_UPLOAD_MESSAGE
    return {
        **dict(record),
        "message": message,
        "rag_backend": "iflytek_chatdoc",
        "iflytek_file_id": chatdoc.get("file_id"),
        "iflytek_repo_id": chatdoc.get("repo_id"),
        "cloud_status": "uploaded",
        "step_by_step": step_by_step,
        "awaiting_activation": step_by_step,
    }
