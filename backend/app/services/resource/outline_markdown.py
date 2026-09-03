from __future__ import annotations

import re
from typing import Any


def to_section_id(title: str) -> str:
    """把标题转换为稳定的章节 ID，保留中文、英文、数字和连字符。"""
    normalized = (
        title.strip()
        .lower()
        .replace(" ", "-")
    )
    normalized = re.sub(r"[^\w\u4e00-\u9fff-]", "", normalized)
    return normalized or "section"


def parse_outline_sections(content: str) -> list[dict[str, Any]]:
    """从 Markdown 一到三级标题中提取可排序的大纲章节列表。"""
    sections: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line in content.split("\n"):
        match = re.match(r"^(#{1,3})\s+(.+)$", line.strip())
        if not match:
            continue
        title = match.group(2).strip()
        section_id = to_section_id(title)
        if section_id in seen:
            section_id = f"{section_id}-{len(sections) + 1}"
        seen.add(section_id)
        sections.append({"id": section_id, "level": len(match.group(1)), "title": title, "order": len(sections)})
    return sections


def split_markdown_sections(content: str) -> tuple[str, dict[str, str]]:
    """返回首个标题前导语，以及 section_id 到正文 Markdown（不含标题行）的映射。"""
    lines = content.split("\n")
    preamble_lines: list[str] = []
    sections: dict[str, str] = {}
    current_id: str | None = None
    current_lines: list[str] = []
    current_title: str | None = None

    def flush() -> None:
        """保存当前章节正文并重置章节游标。"""
        nonlocal current_id, current_lines, current_title
        if current_id and current_title is not None:
            sections[current_id] = "\n".join(current_lines).strip()
        current_id = None
        current_lines = []
        current_title = None

    for line in lines:
        match = re.match(r"^(#{1,3})\s+(.+)$", line.strip())
        if match:
            flush()
            current_title = match.group(2).strip()
            current_id = to_section_id(current_title)
            if current_id in sections:
                current_id = f"{current_id}-{len(sections) + 1}"
            current_lines = []
            continue
        if current_id:
            current_lines.append(line)
        else:
            preamble_lines.append(line)

    flush()
    return "\n".join(preamble_lines).strip(), sections


def apply_outline_order_to_markdown(content: str, outline: list[dict[str, Any]]) -> str:
    """根据大纲顺序重排 Markdown 章节，并保留标题前导语。"""
    preamble, bodies = split_markdown_sections(content)
    ordered = sorted(outline, key=lambda item: int(item.get("order", 0)))
    parts: list[str] = []
    if preamble:
        parts.append(preamble)
    for item in ordered:
        section_id = str(item.get("id") or "")
        title = str(item.get("title") or "").strip()
        level = int(item.get("level") or 2)
        level = max(1, min(3, level))
        if not title:
            continue
        heading = f"{'#' * level} {title}"
        body = bodies.get(section_id, "").strip()
        parts.append(heading)
        if body:
            parts.append(body)
    return "\n\n".join(parts).strip() + ("\n" if parts else "")


def sections_to_outline_json(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """把解析出的章节列表转换为前端可编辑的大纲 JSON。"""
    return [
        {
            "id": item["id"],
            "level": item["level"],
            "title": item["title"],
            "order": index,
        }
        for index, item in enumerate(sections)
    ]
