from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any


@dataclass
class CiteVerifyResult:
    """引用核验结果的数据结构。

    属性:
        status: 整体校验状态，取值通常为 passed、warning 或 failed。
        citation_coverage: 引用覆盖状态，取值通常为 covered、partial 或 missing_course_evidence。
        unsupported_claims: 缺少课程引用支撑的表述列表。
        summary: 面向质量记录或调用方展示的简要结论。
    """

    status: str  # 校验状态：passed | warning | failed
    citation_coverage: str  # 引用覆盖：covered | partial | missing_course_evidence
    unsupported_claims: list[str] = field(default_factory=list)
    summary: str = ""


def _citation_record(citation: Any) -> dict[str, Any]:
    """将不同形态的引用对象规范化为字典。

    参数:
        citation: Pydantic 模型、字典或具备引用字段的任意对象。

    返回:
        至少包含 snippet 与 content 字段的引用字典。

    副作用与失败模式:
        本函数不修改原始引用对象；无法读取的字段会按空值处理。
    """

    if hasattr(citation, "model_dump"):
        data = citation.model_dump()
    elif isinstance(citation, dict):
        data = dict(citation)
    else:
        data = {
            "source_title": getattr(citation, "source_title", None),
            "page_no": getattr(citation, "page_no", None),
            "snippet": getattr(citation, "snippet", "") or "",
            "content": getattr(citation, "content", None),
        }
    body = (data.get("content") or data.get("snippet") or "").strip()
    data["snippet"] = body
    data["content"] = data.get("content") or body or None
    return data


class CiteVerifier:
    """基于规则校验模型回答和生成资源中的引用证据。"""

    PAGE_PATTERNS = (
        re.compile(r"第\s*(\d{1,4})\s*页"),
        re.compile(r"[Pp]\.?\s*(\d{1,4})\b"),
        re.compile(r"page\s*(\d{1,4})", re.IGNORECASE),
        re.compile(r"(\d{1,4})\s*页"),
    )
    PAPER_PATTERN = re.compile(r"(论文|文献|期刊|会议)\s*[`「『]?([^`」』\s，。；]{2,40})")
    FACTUAL_SENTENCE_PATTERN = re.compile(
        r"[^。！？\n]*(?:第\s*\d+\s*页|p\.\s*\d+|定义为|是指|必须|证明|实验表明|根据课程)[^。！？\n]*[。！？]?",
        re.IGNORECASE,
    )
    SIMILARITY_THRESHOLD = 0.38

    def verify(self, answer: str, citations: list[Any]) -> CiteVerifyResult:
        """核验回答中的页码、文献和课程事实句是否有引用支撑。

        参数:
            answer: 待核验的模型回答或生成内容。
            citations: 调用方提供的课程引用列表，元素可为模型、字典或引用对象。

        返回:
            CiteVerifyResult，包含状态、引用覆盖、未支撑表述和摘要。

        副作用与失败模式:
            本方法不写入外部状态；空回答、无引用或引用不足会通过结果状态表达失败或警告。
        """

        text = (answer or "").strip()
        normalized = [_citation_record(item) for item in citations or []]
        if not text:
            return CiteVerifyResult(
                status="warning",
                citation_coverage="missing_course_evidence",
                summary="回答为空，无法完成引用核验",
            )
        if not normalized:
            if self._contains_explicit_citation_claim(text):
                return CiteVerifyResult(
                    status="failed",
                    citation_coverage="missing_course_evidence",
                    unsupported_claims=["回答包含页码或文献表述，但未提供课程引用"],
                    summary="未命中课程引用却出现引用表述",
                )
            return CiteVerifyResult(
                status="warning",
                citation_coverage="missing_course_evidence",
                summary="当前课程资料未找到可靠来源",
            )

        unsupported: list[str] = []
        page_refs = self._extract_page_refs(text)
        cited_pages = {int(item["page_no"]) for item in normalized if item.get("page_no") is not None}
        for page in page_refs:
            if page not in cited_pages:
                unsupported.append(f"提及第 {page} 页，但引用列表中无对应页码")

        for match in self.PAPER_PATTERN.finditer(text):
            title = match.group(2).strip()
            if title and not self._paper_supported(title, normalized):
                unsupported.append(f"提及文献「{title}」，但课程引用中未找到支撑")

        for sentence in self._factual_sentences(text):
            if not self._sentence_supported(sentence, normalized):
                snippet = sentence.strip()[:80]
                unsupported.append(f"课程事实句缺乏引用支撑：{snippet}")

        if unsupported:
            status = "failed" if len(unsupported) >= 2 or any("页" in item for item in unsupported) else "warning"
            coverage = "partial"
            summary = "；".join(unsupported[:3])
            return CiteVerifyResult(
                status=status,
                citation_coverage=coverage,
                unsupported_claims=unsupported,
                summary=summary,
            )

        return CiteVerifyResult(
            status="passed",
            citation_coverage="covered",
            summary="关键结论已有课程切片支撑",
        )

    def quality_dict(self, result: CiteVerifyResult) -> dict[str, Any]:
        """将引用核验结果转换为质量记录字典。

        参数:
            result: verify 返回的引用核验结果。

        返回:
            适合写入质量元数据或响应体的字典。

        副作用与失败模式:
            本方法不产生副作用；依赖传入结果对象具备 CiteVerifyResult 字段。
        """

        return {
            "cite_check": result.status,
            "citation_coverage": result.citation_coverage,
            "unsupported_claims": result.unsupported_claims,
            "summary": result.summary,
        }

    def _extract_page_refs(self, text: str) -> set[int]:
        """从文本中提取页码引用集合。"""

        pages: set[int] = set()
        for pattern in self.PAGE_PATTERNS:
            for match in pattern.finditer(text):
                try:
                    pages.add(int(match.group(1)))
                except (TypeError, ValueError):
                    continue
        return pages

    def _contains_explicit_citation_claim(self, text: str) -> bool:
        """判断文本是否显式声称引用了页码或文献。"""

        return bool(self._extract_page_refs(text) or self.PAPER_PATTERN.search(text))

    def _factual_sentences(self, text: str) -> list[str]:
        """提取需要课程引用支撑的事实性句子。"""

        sentences = [match.group(0).strip() for match in self.FACTUAL_SENTENCE_PATTERN.finditer(text)]
        return [sentence for sentence in sentences if len(sentence) >= 12][:6]

    def _sentence_supported(self, sentence: str, citations: list[dict[str, Any]]) -> bool:
        """判断单个事实句是否被课程引用支撑。"""

        sentence_pages = self._extract_page_refs(sentence)
        cited_pages = {int(item["page_no"]) for item in citations if item.get("page_no") is not None}
        if sentence_pages and sentence_pages.issubset(cited_pages):
            return True
        lowered = sentence.lower()
        for citation in citations:
            snippet = (citation.get("snippet") or "").strip()
            title = (citation.get("source_title") or "").strip()
            if snippet and SequenceMatcher(None, lowered, snippet.lower()).ratio() >= self.SIMILARITY_THRESHOLD:
                return True
            if title and title.lower() in lowered:
                return True
            overlap = self._token_overlap(lowered, snippet.lower())
            if overlap >= 0.22:
                return True
        return False

    def _paper_supported(self, title: str, citations: list[dict[str, Any]]) -> bool:
        """判断文献标题是否出现在课程引用来源或正文中。"""

        needle = title.lower()
        for citation in citations:
            source = (citation.get("source_title") or "").lower()
            snippet = (citation.get("snippet") or "").lower()
            if needle in source or needle in snippet:
                return True
        return False

    @staticmethod
    def _token_overlap(left: str, right: str) -> float:
        """计算两个文本之间的简单词元重叠比例。"""

        left_tokens = {token for token in re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}", left) if len(token) >= 2}
        right_tokens = {token for token in re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}", right) if len(token) >= 2}
        if not left_tokens or not right_tokens:
            return 0.0
        return len(left_tokens & right_tokens) / len(left_tokens)
