#!/usr/bin/env python3
"""将 globals.legacy.css 按原始行序切分为 ITCSS + pages 文件，并生成 index.css。"""

from __future__ import annotations

from pathlib import Path

STYLES = Path(__file__).resolve().parent.parent / "src" / "styles"
LEGACY = STYLES / "globals.legacy.css"

# (start_line, end_line, relative_path) — 1-based inclusive，严格保持原始顺序
CHUNKS: list[tuple[int, int, str]] = [
    (1, 78, "5-utilities/helpers.css"),
    (79, 88, "3-generic/page-hooks.css"),
    (89, 544, "pages/learning-path/learning-path.css"),
    (545, 674, "4-components/layout-shell.css"),
    (675, 1007, "pages/learning-path/learning-path.css"),
    (1008, 2182, "pages/learning-path/learning-path.css"),
    (2183, 2203, "5-utilities/helpers.css"),
    (2204, 4327, "4-components/ai-workspace.css"),
    (4328, 4419, "4-components/panel-close.css"),
    (4420, 4467, "pages/personal-settings/personal-settings.css"),
    (4468, 6398, "pages/personal-settings/personal-settings.css"),
    (6399, 6397 + 1315, "pages/learning-profile/learning-profile.css"),  # 6399-7713
    (7714, 8251, "4-components/scroller.css"),
    (8252, 9890, "pages/assessment/assessment.css"),
    (9891, 9948, "5-utilities/tailwind-components.css"),
    (9949, 10709, "4-components/workspace-chrome.css"),
    (10710, 11677, "pages/announcements/announcements.css"),
    (11678, 12790, "pages/admin/interface-settings.css"),
    (12791, 14321, "pages/admin/knowledge-base.css"),
    (14322, 15001, "pages/admin/knowledge-chunk-workbench.css"),
    (15002, 16030, "4-components/resource-generation.css"),
    (16031, 17357, "4-components/workspace-theme.css"),
    (17358, 17449, "4-components/overlay-transparency.css"),
    (17450, 18407, "pages/admin/admin-workbench.css"),
    (18408, 19018, "4-components/onboarding.css"),
]

# Fix the learning-profile line - use explicit
CHUNKS[11] = (6399, 7713, "pages/learning-profile/learning-profile.css")


def read_lines() -> list[str]:
    return LEGACY.read_text(encoding="utf-8").splitlines(keepends=True)


def write_chunk(path: Path, content: str, append: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if append and path.exists():
        with path.open("a", encoding="utf-8") as f:
            if content and not content.startswith("\n"):
                f.write("\n")
            f.write(content)
    else:
        path.write_text(content, encoding="utf-8")


def main() -> None:
    if not LEGACY.exists():
        raise SystemExit(f"缺少 {LEGACY}")

    lines = read_lines()
    total = len(lines)
    file_contents: dict[str, str] = {}
    import_order: list[str] = []

    for start, end, rel in CHUNKS:
        if start < 1 or end > total or start > end:
            raise SystemExit(f"行范围无效 {start}-{end}（文件共 {total} 行）: {rel}")
        chunk = "".join(lines[start - 1 : end])
        if rel not in file_contents:
            file_contents[rel] = chunk
            import_order.append(rel)
        else:
            file_contents[rel] += chunk

    for rel, content in file_contents.items():
        out = STYLES / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(content.rstrip() + "\n", encoding="utf-8")

    (STYLES / "index.css").write_text(
        "/* 样式加载入口见 global-styles.ts，禁止在此使用 @import 串联（@tailwind 之后会被浏览器丢弃） */\n",
        encoding="utf-8",
    )

    print(f"已切分 {len(CHUNKS)} 段 → {len(file_contents)} 个文件")
    for rel in import_order:
        n = len(file_contents[rel].splitlines())
        print(f"  {rel}: {n} 行")


if __name__ == "__main__":
    main()
