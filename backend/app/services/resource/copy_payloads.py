from __future__ import annotations

import uuid
from typing import Any, TypedDict

from app.models import Resource, ResourceVersion


class ResourceCopyPayload(TypedDict):
    """创建资源副本所需的 Resource 初始化参数。"""

    course_id: uuid.UUID | None
    concept_id: uuid.UUID | None
    path_node_id: uuid.UUID | None
    code: str
    title: str
    resource_type: str
    difficulty: str
    status: str
    summary: str
    content_uri: str | None
    generation_basis_json: dict[str, Any]
    citations_json: list[dict[str, Any]]
    quality_check_result: dict[str, Any]
    safety_status: str
    quality_score: int
    created_by_user_id: uuid.UUID | None


class ResourceCopyVersionPayload(TypedDict):
    """创建资源副本初始版本所需的 ResourceVersion 初始化参数。"""

    resource_id: uuid.UUID
    version: int
    content: str
    meta_json: dict[str, Any]


def build_resource_copy_payload(
    source: Resource,
    copy_code: str,
    created_by_user_id: uuid.UUID | None,
) -> ResourceCopyPayload:
    """构造资源副本实体的初始化参数。

    参数:
        source: 被复制的源资源实体。
        copy_code: 已生成并通过仓储规范化的副本 code。
        created_by_user_id: 副本归属用户 ID，匿名复制时允许为空。

    返回:
        可直接传入 Resource 构造函数的关键字参数，保持复制资源对外 API 行为不变。
    """
    return {
        "course_id": source.course_id,
        "concept_id": source.concept_id,
        "path_node_id": source.path_node_id,
        "code": copy_code,
        "title": f"{source.title}（副本）",
        "resource_type": source.resource_type,
        "difficulty": source.difficulty,
        "status": "private",
        "summary": source.summary,
        "content_uri": None,
        "generation_basis_json": {**(source.generation_basis_json or {}), "copied_from": source.code},
        "citations_json": list(source.citations_json or []),
        "quality_check_result": dict(source.quality_check_result or {}),
        "safety_status": source.safety_status,
        "quality_score": source.quality_score,
        "created_by_user_id": created_by_user_id,
    }


def build_resource_copy_version_payload(
    copied_resource_id: uuid.UUID,
    source: Resource,
    latest_version: ResourceVersion | None,
) -> ResourceCopyVersionPayload:
    """构造资源副本的初始版本初始化参数。

    参数:
        copied_resource_id: 已 flush 得到的副本资源主键。
        source: 被复制的源资源实体，用于记录复制来源。
        latest_version: 源资源最新版本；缺失时沿用旧逻辑写入空正文。

    返回:
        可直接传入 ResourceVersion 构造函数的关键字参数。
    """
    return {
        "resource_id": copied_resource_id,
        "version": 1,
        "content": latest_version.content if latest_version else "",
        "meta_json": {"source": "copied_resource", "copied_from": source.code},
    }
