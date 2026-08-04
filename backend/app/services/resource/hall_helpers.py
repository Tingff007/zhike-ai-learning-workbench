from __future__ import annotations

import re
from collections import Counter
from typing import Any, Mapping, TypedDict


class HallEvidenceItem(TypedDict, total=False):
    """资源大厅推荐解释证据的最小对外结构。"""

    key: str
    label: str
    summary: str
    source: str
    score: int


def hall_match_reason(resource: Any, *, current_course: Any | None, score: float) -> str:
    """生成前端卡片上可读的推荐原因。

    参数:
        resource: 资源实体或测试中的轻量对象。
        current_course: 当前课程实体，缺失时不输出课程匹配原因。
        score: 已计算的推荐分，用于无其它理由时的兜底文案。

    返回:
        由最多三条原因拼接出的中文说明。
    """
    citation_count = len(getattr(resource, "citations_json", None) or [])
    reasons: list[str] = []
    if current_course and getattr(resource, "course_id", None) == getattr(current_course, "id", None):
        reasons.append("匹配当前课程")
    if citation_count:
        reasons.append(f"{citation_count} 条引用可追溯")
    if int(getattr(resource, "quality_score", 0) or 0) >= 90:
        reasons.append("质量评分优秀")
    if int(getattr(resource, "copied_count", 0) or 0) > 0:
        reasons.append(f"已被复用 {int(getattr(resource, 'copied_count', 0) or 0)} 次")
    if not reasons:
        reasons.append(f"综合推荐分 {score:g}")
    return "，".join(reasons[:3])


def is_public_hall_resource(resource: Any, community: Any | None = None) -> bool:
    """判断资源是否可作为社区资源展示。

    参数:
        resource: 资源实体或测试中的轻量对象。
        community: 可选社区审核记录。

    返回:
        资源自身或社区审核状态允许公开展示时返回 True。
    """
    community_status = getattr(community, "review_status", None) if community else None
    return getattr(resource, "status", None) in {"published", "featured"} or community_status in {"approved", "featured"}


def is_featured_hall_resource(resource: Any, community: Any | None = None) -> bool:
    """判断资源是否属于大厅精选。"""
    community_status = getattr(community, "review_status", None) if community else None
    return getattr(resource, "status", None) == "featured" or community_status == "featured"


def hall_recommendation_score(
    resource: Any,
    *,
    current_course: Any | None,
    community: Any | None = None,
) -> float:
    """按质量、引用、复用、浏览和课程相关度计算大厅推荐分。"""
    citation_count = len(getattr(resource, "citations_json", None) or [])
    quality_score = int(getattr(resource, "quality_score", 0) or 0)
    score = float(quality_score)
    score += min(citation_count, 8) * 3.5
    score += min(int(getattr(resource, "copied_count", 0) or 0), 20) * 1.6
    score += min(int(getattr(resource, "view_count", 0) or 0), 80) * 0.25
    if current_course and getattr(resource, "course_id", None) == getattr(current_course, "id", None):
        score += 12
    if getattr(resource, "course_id", None) is None:
        score += 4
    if is_featured_hall_resource(resource, community):
        score += 14
    if getattr(resource, "safety_status", None) and getattr(resource, "safety_status", None) != "passed":
        score -= 20
    if not citation_count and getattr(resource, "course_id", None):
        score -= 8
    return round(max(score, 0), 1)


def compact_evidence_summary(value: Any, limit: int = 96) -> str:
    """压缩推荐证据文案，避免资源卡片出现长文本溢出。

    参数:
        value: 任意待展示文本值。
        limit: 保留的最大字符数。

    返回:
        去除多余空白并按长度截断后的文本。
    """
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    return f"{text[:limit]}…" if len(text) > limit else text


def append_recommendation_evidence(
    items: list[HallEvidenceItem],
    *,
    key: str,
    label: str,
    summary: Any,
    source: str,
    score: int | None = None,
) -> None:
    """追加去重后的推荐解释证据。

    参数:
        items: 需要原地追加的证据列表。
        key: 证据唯一键，相同键只保留第一次追加结果。
        label: 前端展示标签。
        summary: 证据说明，追加前会压缩空白和长度。
        source: 证据来源标识。
        score: 可选证据分，写入前会裁剪到 0 到 100。
    """
    text = compact_evidence_summary(summary)
    if not text or any(item.get("key") == key for item in items):
        return
    payload: HallEvidenceItem = {"key": key, "label": label, "summary": text, "source": source}
    if score is not None:
        payload["score"] = max(0, min(100, int(score)))
    items.append(payload)


def hall_filter_options(counts: Counter[str], labels: Mapping[str, str]) -> list[dict[str, Any]]:
    """把计数器转换为前端筛选项。

    参数:
        counts: 各筛选值对应的命中数量。
        labels: 筛选值到前端中文标签的映射。

    返回:
        按数量降序、标签升序排列的筛选项列表。
    """
    return [
        {"value": value, "label": labels.get(value, value), "count": count}
        for value, count in sorted(counts.items(), key=lambda item: (-item[1], labels.get(item[0], item[0])))
    ]


def hall_sort_time(resource: Any) -> str:
    """返回稳定的资源更新时间排序键。

    参数:
        resource: 资源实体或测试中的轻量对象。

    返回:
        优先使用 updated_at，其次使用 created_at 的 ISO 字符串。
    """
    value = getattr(resource, "updated_at", None) or getattr(resource, "created_at", None)
    return value.isoformat() if value else ""


def matches_hall_scope(item: Mapping[str, Any], scope: str, current_course_slug: str | None) -> bool:
    """判断大厅资源字典是否命中当前范围筛选。

    参数:
        item: 已序列化的资源大厅卡片数据。
        scope: 前端传入的范围筛选值。
        current_course_slug: 当前课程 slug，用于 course 范围判断。

    返回:
        命中筛选范围时返回 True。
    """
    normalized = (scope or "all").strip().lower()
    if normalized == "all":
        return True
    if normalized == "course":
        return bool(current_course_slug) and item.get("course_id") == current_course_slug
    if normalized == "general":
        return item.get("scope") == "general" or not item.get("course_id")
    if normalized == "mine":
        return item.get("owner_scope") == "mine"
    if normalized == "community":
        return item.get("owner_scope") == "community" or item.get("status") in {"published", "featured"}
    if normalized == "recommended":
        return bool(item.get("is_recommended"))
    return True
