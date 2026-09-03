from __future__ import annotations

from app.schemas.common import Citation


def citation_text(citation: Citation) -> str:
    """提取引用中可用于上下文拼接的正文文本。

    参数:
        citation: 课程引用对象。

    返回:
        优先返回 content，其次返回 snippet；两者都为空时返回空字符串。

    副作用与失败模式:
        本函数不产生副作用；依赖传入对象具备 Citation 契约字段。
    """

    return (citation.content or citation.snippet or "").strip()


def build_llm_context(citations: list[Citation], *, max_items: int = 5) -> str:
    """为 LLM Prompt 构建课程引用证据块。

    参数:
        citations: 候选课程引用列表。
        max_items: 最多拼接的引用数量。

    返回:
        按引用顺序拼接的多段证据文本，空引用或空正文会被跳过。

    副作用与失败模式:
        本函数不产生副作用；依赖 citation_text 解析正文。
    """

    lines: list[str] = []
    for index, citation in enumerate(citations[:max_items]):
        body = citation_text(citation)
        if not body:
            continue
        lines.append(
            f"[{index + 1}] {citation.source_title or citation.source_id}"
            f" · {citation.asset_type or citation.kind or 'chunk'}"
            f" · {citation.heading_path_text or citation.section_path or '未标注章节'}"
            f" · score={citation.similarity:.2f}\n{body}"
        )
    return "\n\n".join(lines)
