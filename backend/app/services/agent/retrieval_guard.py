from __future__ import annotations

from app.core.config import settings
from app.schemas.common import Citation


def max_citation_score(citations: list[Citation]) -> float:
    """计算引用列表中的最高相似度分数。

    参数:
        citations: 检索得到的课程引用列表。

    返回:
        最高 similarity 分数；引用为空时返回 0.0。

    副作用与失败模式:
        本函数不产生副作用；空 similarity 会按 0 处理。
    """

    if not citations:
        return 0.0
    return max(float(citation.similarity or 0) for citation in citations)


def should_refuse_low_confidence(
    citations: list[Citation],
    *,
    require_citations: bool = True,
    threshold: float | None = None,
) -> tuple[bool, float]:
    """判断检索证据不足时是否应拒答。

    参数:
        citations: 检索得到的课程引用列表。
        require_citations: 是否要求必须存在引用证据。
        threshold: 自定义最低相似度阈值；为空时使用系统配置。

    返回:
        二元组，第一个值表示是否拒答，第二个值表示最高引用分数。

    副作用与失败模式:
        本函数不产生副作用；依赖 settings.RAG_RETRIEVAL_MIN_SCORE 作为默认阈值。
    """

    if not require_citations:
        return False, max_citation_score(citations)
    limit = settings.RAG_RETRIEVAL_MIN_SCORE if threshold is None else threshold
    top = max_citation_score(citations)
    if not citations:
        return True, top
    if top < limit:
        return True, top
    return False, top
