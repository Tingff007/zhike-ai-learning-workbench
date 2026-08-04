from __future__ import annotations

from typing import Literal, TypedDict


DELETE_REASON_RESOURCE_NOT_FOUND = "resource not found"
DELETE_REASON_NOT_OWNER = "只能删除自己生成的资源"


class ResourceDeleteResult(TypedDict):
    """单个资源软删除成功后的对外结果结构。"""

    resource_id: str
    status: Literal["deleted"]
    deleted_at: str


class ResourceDeleteRejectedItem(TypedDict):
    """批量删除中无法删除的资源条目。"""

    resource_id: str
    reason: str


class ResourceBatchDeleteResult(TypedDict):
    """批量软删除接口返回的稳定结构。"""

    status: Literal["ok"]
    deleted: list[ResourceDeleteResult]
    rejected: list[ResourceDeleteRejectedItem]
    deleted_count: int
    rejected_count: int


def build_delete_result(resource_id: str, deleted_at: str) -> ResourceDeleteResult:
    """构造单个资源软删除成功结果。

    参数:
        resource_id: 对外资源 code。
        deleted_at: 已生成的删除时间戳，调用方负责保证格式与现有 API 一致。

    返回:
        资源删除成功时返回给 API 层的字典结构。
    """
    return {"resource_id": resource_id, "status": "deleted", "deleted_at": deleted_at}


def build_delete_rejection(resource_id: str, reason: str) -> ResourceDeleteRejectedItem:
    """构造批量删除中的拒绝项。

    参数:
        resource_id: 请求中传入的资源标识。
        reason: 拒绝删除的原因文案，保持与原接口兼容。

    返回:
        批量删除结果中的单个拒绝项。
    """
    return {"resource_id": resource_id, "reason": reason}


def build_batch_delete_result(
    deleted: list[ResourceDeleteResult],
    rejected: list[ResourceDeleteRejectedItem],
) -> ResourceBatchDeleteResult:
    """汇总批量软删除结果，集中维护返回字段和计数。

    参数:
        deleted: 已完成软删除的资源结果列表。
        rejected: 未能删除的资源拒绝列表。

    返回:
        与现有批量删除 API 行为一致的汇总字典。
    """
    return {
        "status": "ok",
        "deleted": deleted,
        "rejected": rejected,
        "deleted_count": len(deleted),
        "rejected_count": len(rejected),
    }
