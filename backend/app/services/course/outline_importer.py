from __future__ import annotations

import re
from pathlib import Path

from app.schemas.course import CourseOutlineConceptDraft, CourseOutlineImportRequest, CourseOutlineSectionDraft


MAX_README_BYTES = 2 * 1024 * 1024


class ReadmeOutlineImporter:
    """从 README 或 Markdown 目录文本生成课程大纲草稿的导入器。"""

    bullet_pattern = re.compile(r"^(?P<indent>\s*)[*+-]\s+(?P<number>\d+(?:\\?\.\d+)*)(?:\\?\.)?\s+(?P<title>.+?)\s*$")

    def preview(self, payload: CourseOutlineImportRequest) -> dict:
        """预览 README 目录导入结果。

        参数:
            payload: 包含 README 文本或文件路径的课程大纲导入请求。

        返回:
            包含章节草稿、统计信息和导入提醒的字典。

        异常:
            ValueError: 当来源缺失、文件无效或目录无法解析时抛出。
        """
        source_name, text = self._read_source(payload)
        sections = self._parse(text)
        warnings = self._warnings(sections)
        return {
            "status": "parsed",
            "source_name": source_name,
            "sections": [section.model_dump() for section in sections],
            "stats": {
                "sections": len(sections),
                "concepts": sum(1 for section in sections for concept in section.concepts if concept.include),
                "excluded": sum(1 for section in sections for concept in section.concepts if not concept.include),
            },
            "warnings": warnings,
        }

    def _read_source(self, payload: CourseOutlineImportRequest) -> tuple[str, str]:
        """读取请求中的 README 文本或本地文件，并返回来源名称和内容。"""
        if payload.readme_text and payload.readme_text.strip():
            return payload.source_name or "README.md", payload.readme_text
        if not payload.source_path:
            raise ValueError("source_path or readme_text is required")

        path = Path(payload.source_path).expanduser()
        if path.suffix.lower() not in {".md", ".markdown", ".txt"}:
            raise ValueError("only README markdown/text files can be parsed")
        if not path.exists() or not path.is_file():
            raise ValueError("source file not found")
        if path.stat().st_size > MAX_README_BYTES:
            raise ValueError("source file is too large")
        return payload.source_name or path.name, path.read_text(encoding="utf-8")

    def _parse(self, readme_text: str) -> list[CourseOutlineSectionDraft]:
        """将 README 目录条目解析为章节和概念草稿。"""
        catalog = self._catalog_block(readme_text)
        sections: list[CourseOutlineSectionDraft] = []
        section_by_number: dict[str, CourseOutlineSectionDraft] = {}
        previous_concept_code: str | None = None
        concept_order = 1

        for raw_line in catalog.splitlines():
            match = self.bullet_pattern.match(raw_line)
            if not match:
                continue
            number = match.group("number").replace("\\.", ".")
            title = self._clean_title(match.group("title"))
            if not title:
                continue

            if "." not in number:
                section = CourseOutlineSectionDraft(
                    code=f"ch{number}",
                    title=title,
                    description=f"从教材目录第 {number} 章《{title}》导入，可由管理员调整后发布。",
                    order_index=int(number),
                    source_number=number,
                    source_title=title,
                    include=True,
                    concepts=[],
                )
                sections.append(section)
                section_by_number[number] = section
                continue

            root_number = number.split(".", 1)[0]
            section = section_by_number.get(root_number)
            if not section:
                section = CourseOutlineSectionDraft(
                    code=f"ch{root_number}",
                    title=f"第 {root_number} 章",
                    description=f"从教材目录第 {root_number} 章导入，可由管理员调整后发布。",
                    order_index=int(root_number),
                    source_number=root_number,
                    source_title=f"第 {root_number} 章",
                    include=True,
                    concepts=[],
                )
                sections.append(section)
                section_by_number[root_number] = section

            include = not self._is_appendix(title)
            code = f"ch{number.replace('.', '_')}"
            prerequisites = [previous_concept_code] if previous_concept_code and include else []
            concept = CourseOutlineConceptDraft(
                code=code,
                title=title,
                definition=f"教材目录 {number}《{title}》，用于课程资料检索、资源生成和学习路径规划。",
                difficulty=self._difficulty(number),
                recommended_order=concept_order,
                prerequisites=prerequisites,
                status="published" if include else "draft",
                source_number=number,
                source_title=title,
                include=include,
            )
            section.concepts.append(concept)
            if include:
                previous_concept_code = code
                concept_order += 1

        if not sections:
            raise ValueError("no catalog entries were found in README")
        return sections

    @staticmethod
    def _catalog_block(readme_text: str) -> str:
        """优先截取 README 中的目录章节，缺少目录标题时返回全文。"""
        match = re.search(r"^##\s*目录\s*$", readme_text, flags=re.MULTILINE)
        if not match:
            return readme_text
        start = match.end()
        next_heading = re.search(r"^##\s+", readme_text[start:], flags=re.MULTILINE)
        end = start + next_heading.start() if next_heading else len(readme_text)
        return readme_text[start:end]

    @staticmethod
    def _clean_title(title: str) -> str:
        """清理目录标题中的多余空白和 Markdown 链接语法。"""
        title = re.sub(r"\s+", " ", title).strip()
        title = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", title)
        return title.strip()

    @staticmethod
    def _is_appendix(title: str) -> bool:
        """判断目录标题是否属于附录类内容。"""
        normalized = title.replace(" ", "")
        return "本章附录" in normalized or normalized.endswith("附录")

    @staticmethod
    def _difficulty(number: str) -> str:
        """根据章节编号推断课程概念的默认难度。"""
        chapter = int(number.split(".", 1)[0])
        if chapter <= 2:
            return "basic"
        if chapter <= 6:
            return "intermediate"
        return "advanced"

    @staticmethod
    def _warnings(sections: list[CourseOutlineSectionDraft]) -> list[str]:
        """根据导入结果生成管理员需要关注的目录覆盖提醒。"""
        warnings: list[str] = []
        titles = " ".join([section.title for section in sections] + [concept.title for section in sections for concept in section.concepts])
        if "Transformer" not in titles and "transformer" not in titles:
            warnings.append("README 目录未覆盖 Transformer，建议管理员补充为拓展章节或上传新版资料。")
        if "生成" not in titles and "自编码" not in titles:
            warnings.append("README 目录未覆盖自编码器/生成模型，可标记为资料缺口后单独补充。")
        excluded = sum(1 for section in sections for concept in section.concepts if not concept.include)
        if excluded:
            warnings.append(f"已将 {excluded} 个附录类条目标记为草稿，管理员可按需纳入课程。")
        return warnings


class D2lPlainTocImporter:
    """解析从 D2L PDF（如《深度学习-01.pdf》）抽取出的纯文本目录。"""

    section_header = re.compile(r"第(\d+)章\s*([^\d第\r\n]+)")
    appendix_header = re.compile(r"附录([A-Z])\s*([^\d第\r\n]+)")
    # 避免把 3.2.1 中的 3.2 误识别为章节标题，保留真正的 3.2 条目。
    entry_number_pattern = re.compile(r"(?<!\d)(\d+(?:\.\d+)+)(?!\.\d)")

    def preview(self, toc_text: str, *, source_name: str = "D2L PDF 目录") -> dict:
        """预览 D2L 目录文本导入结果。

        参数:
            toc_text: 从 D2L PDF 中抽取的纯文本目录。
            source_name: 展示给管理端的来源名称。

        返回:
            包含章节草稿、统计信息和导入提醒的字典。

        异常:
            ValueError: 当目录文本为空或无法识别章节条目时抛出。
        """
        sections = self.parse(toc_text)
        warnings = ReadmeOutlineImporter._warnings(sections)
        warnings.insert(0, "大纲来自《动手学深度学习》PDF 目录文本，已与知识库切片章节对齐。")
        return {
            "status": "parsed",
            "source_name": source_name,
            "sections": [section.model_dump() for section in sections],
            "stats": {
                "sections": len(sections),
                "concepts": sum(1 for section in sections for concept in section.concepts if concept.include),
                "excluded": sum(1 for section in sections for concept in section.concepts if not concept.include),
            },
            "warnings": warnings,
        }

    def parse(self, toc_text: str) -> list[CourseOutlineSectionDraft]:
        """解析 D2L 纯文本目录为课程章节草稿列表。

        参数:
            toc_text: 从教材 PDF 或目录页抽取的纯文本。

        返回:
            按章节顺序组织的课程章节草稿列表。

        异常:
            ValueError: 当目录文本为空、缺少章节标题或没有编号条目时抛出。
        """
        text = self._normalize(toc_text)
        if not text.strip():
            raise ValueError("no catalog text was provided")
        text = self._ensure_chapter_headers(text)

        sections: list[CourseOutlineSectionDraft] = []
        section_by_number: dict[str, CourseOutlineSectionDraft] = {}
        previous_concept_code: str | None = None
        concept_order = 1

        headers = list(self.section_header.finditer(text))
        if not headers:
            raise ValueError("no chapter headers were found in D2L catalog text")

        for index, match in enumerate(headers):
            chapter_number = match.group(1)
            chapter_title = ReadmeOutlineImporter._clean_title(match.group(2))
            if self._is_appendix_section(chapter_title):
                continue
            if not chapter_title:
                chapter_title = f"第 {chapter_number} 章"
            block_end = headers[index + 1].start() if index + 1 < len(headers) else len(text)
            block = text[match.end() : block_end]
            section = CourseOutlineSectionDraft(
                code=f"ch{chapter_number}",
                title=f"第 {chapter_number} 章 {chapter_title}",
                description=f"从《动手学深度学习》PDF 目录第 {chapter_number} 章导入。",
                order_index=int(chapter_number),
                source_number=chapter_number,
                source_title=chapter_title,
                include=True,
                concepts=[],
            )
            sections.append(section)
            section_by_number[chapter_number] = section
            previous_concept_code, concept_order = self._append_entries(
                block,
                section=section,
                section_number=chapter_number,
                previous_concept_code=previous_concept_code,
                concept_order=concept_order,
            )

        if not any(section.concepts for section in sections):
            raise ValueError("no numbered catalog entries were found in D2L catalog text")
        return sections

    def _append_entries(
        self,
        block: str,
        *,
        section: CourseOutlineSectionDraft,
        section_number: str,
        previous_concept_code: str | None,
        concept_order: int,
    ) -> tuple[str | None, int]:
        """把章节文本块中的编号小节追加为概念草稿，并延续前置依赖顺序。"""
        matches = list(self.entry_number_pattern.finditer(block))
        for index, entry in enumerate(matches):
            number = entry.group(1)
            if not number.startswith(f"{section_number}."):
                continue
            title_start = entry.end()
            title_end = matches[index + 1].start() if index + 1 < len(matches) else len(block)
            title = self._entry_title(block[title_start:title_end])
            if not title:
                continue
            if not self._looks_like_catalog_title(title):
                continue
            include = not ReadmeOutlineImporter._is_appendix(title)
            code = f"ch{number.replace('.', '_')}"
            prerequisites = [previous_concept_code] if previous_concept_code and include else []
            display_title = f"{number} {title}"[:200]
            section.concepts.append(
                CourseOutlineConceptDraft(
                    code=code,
                    title=display_title,
                    definition=f"教材《动手学深度学习》{number}《{title}》，与知识库 PDF 切片目录一致。",
                    difficulty=ReadmeOutlineImporter._difficulty(number),
                    recommended_order=concept_order,
                    prerequisites=prerequisites,
                    status="published" if include else "draft",
                    source_number=number,
                    source_title=title,
                    include=include,
                )
            )
            if include:
                previous_concept_code = code
                concept_order += 1
        return previous_concept_code, concept_order

    @staticmethod
    def _normalize(toc_text: str) -> str:
        """规范化目录文本换行、页眉和空白，便于后续正则解析。"""
        text = toc_text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r"DIVE\s+INTO\s+DEEP\s+LEARNING.*?(?=第\d+章)", "", text, flags=re.IGNORECASE | re.DOTALL)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    @classmethod
    def _ensure_chapter_headers(cls, text: str) -> str:
        """当目录片段从 1.x 跳到 3.x 等情况时，补回缺失的 `第N章` 标记。"""
        existing = {match.group(1) for match in cls.section_header.finditer(text)}
        insertions: list[tuple[int, str]] = []
        for chapter in range(1, 30):
            chapter_key = str(chapter)
            if chapter_key in existing:
                continue
            # (?<![\d.]) 避免把 3.1.1 中的 1.1 误识别为独立小节号。
            anchor = re.search(rf"(?<![\d.]){chapter}\.\d+(?:\.\d+)?", text)
            if not anchor:
                continue
            insertions.append((anchor.start(), f"第{chapter}章 "))
            existing.add(chapter_key)
        for position, header in sorted(insertions, key=lambda item: item[0], reverse=True):
            text = text[:position] + header + text[position:]
        return text

    @staticmethod
    def _is_appendix_section(title: str) -> bool:
        """判断章节标题是否是目录或附录段落。"""
        normalized = title.replace(" ", "")
        return normalized.startswith("附录") or normalized in {"目录"}

    @staticmethod
    def _entry_title(raw: str) -> str:
        """从编号后的原始片段中提取小节标题。"""
        title = ReadmeOutlineImporter._clean_title(raw)
        title = re.split(r"\s+(?=\d+(?:\.\d+)+(?:\s|$))", title, maxsplit=1)[0].strip()
        title = re.sub(r"\s+\d{1,3}$", "", title).strip()
        return title[:120]

    @staticmethod
    def _looks_like_catalog_title(title: str) -> bool:
        """过滤明显来自正文而非目录的小节标题候选。"""
        if len(title) < 2 or len(title) > 80:
            return False
        if re.search(r"[。！？；]", title):
            return False
        body_patterns = (
            r"我们可以",
            r"如下图",
            r"如下式",
            r"表示为",
            r"定义为",
            r"torch\.nn",
            r"torch\.optim",
        )
        return not any(re.search(pattern, title) for pattern in body_patterns)
