#!/usr/bin/env python3
"""【已 supersede】请使用 split-globals-complete.py。本脚本仅用于第 1 步静态层剥离历史记录。"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

STYLES = Path(__file__).resolve().parent.parent / "src" / "styles"
GLOBALS = STYLES / "globals.css"
BACKUP = STYLES / "globals.backup.css"

DIRS = [
    STYLES / "1-settings",
    STYLES / "2-reset",
    STYLES / "3-generic",
    STYLES / "4-components",
    STYLES / "5-utilities",
]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def extract_root_blocks(text: str) -> tuple[str, str]:
    """提取所有行首 :root { ... } 块到 variables（含 AI 聊天区等二次 :root 令牌）。"""
    pattern = re.compile(r"^:root\s*\{[^}]*\}\s*", re.MULTILINE | re.DOTALL)
    blocks = [match.group(0).strip() for match in pattern.finditer(text)]
    without = pattern.sub("", text)
    variables = "\n\n".join(blocks) + ("\n" if blocks else "")
    return variables, without


def extract_layer_base(text: str) -> tuple[str, str]:
    """提取 @layer base { ... } 到 reset/base。"""
    pattern = re.compile(r"@layer base\s*\{.*?\n\}", re.MULTILINE | re.DOTALL)
    match = pattern.search(text)
    if not match:
        return "", text
    block = match.group(0).strip()
    without = text[: match.start()] + text[match.end() :]
    return block + "\n", without


def extract_body_root_rules(text: str) -> tuple[str, str]:
    """仅提取文件顶部的基础 body / #root 规则（避免误匹配页面内 body 选择器）。"""
    rules: list[str] = []
    remaining = text
    for selector_pattern in (
        r"^body\s*\{[^}]*\}\s*",
        r"^#root\s*\{[^}]*\}\s*",
    ):
        match = re.match(selector_pattern, remaining, re.MULTILINE | re.DOTALL)
        if match:
            rules.append(match.group(0).strip())
            remaining = remaining[match.end() :]
    base = "\n\n".join(rules) + ("\n" if rules else "")
    return base, remaining


def extract_keyframes(text: str) -> tuple[str, str]:
    """提取全部 @keyframes 块（含紧邻其上的单行注释）。"""
    blocks: list[str] = []
    spans: list[tuple[int, int]] = []
    pos = 0
    while True:
        idx = text.find("@keyframes", pos)
        if idx == -1:
            break
        start = idx
        # 若上一非空行是块注释，一并纳入
        line_start = text.rfind("\n", 0, idx) + 1
        prefix = text[line_start:idx]
        if prefix.strip().startswith("/*"):
            start = line_start
        brace = text.find("{", idx)
        if brace == -1:
            break
        depth = 0
        end = brace
        for i in range(brace, len(text)):
            ch = text[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        block = text[start:end].strip()
        blocks.append(block)
        spans.append((start, end))
        pos = end

    without_parts: list[str] = []
    last = 0
    for start, end in spans:
        without_parts.append(text[last:start])
        last = end
    without_parts.append(text[last:])
    without = "".join(without_parts)
    keyframes = "\n\n".join(blocks) + ("\n" if blocks else "")
    return keyframes, without


def extract_tailwind_preamble(text: str) -> tuple[str, str]:
    lines = text.splitlines(keepends=True)
    preamble: list[str] = []
    rest_start = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("@tailwind"):
            preamble.append(line)
            rest_start = i + 1
        elif stripped == "" and preamble and rest_start == i:
            rest_start = i + 1
        elif preamble:
            break
    if not preamble:
        return "", text
    preamble_text = "".join(preamble)
    if not preamble_text.endswith("\n"):
        preamble_text += "\n"
    rest = "".join(lines[rest_start:])
    return preamble_text, rest


def collapse_blank_lines(text: str, max_run: int = 2) -> str:
    lines = text.splitlines()
    out: list[str] = []
    blank = 0
    for line in lines:
        if line.strip() == "":
            blank += 1
            if blank <= max_run:
                out.append(line)
        else:
            blank = 0
            out.append(line)
    result = "\n".join(out)
    if text.endswith("\n"):
        result += "\n"
    return result


def main() -> None:
    if not GLOBALS.exists():
        raise SystemExit(f"未找到 {GLOBALS}")

    original = read_text(GLOBALS)
    if len(original.splitlines()) < 1000:
        raise SystemExit(
            "globals.css 行数异常偏少，请先 git checkout HEAD -- frontend/src/styles/globals.css 恢复后再运行。"
        )

    # 第 0 步：备份（仅当备份缺失或过短时重建）
    if not BACKUP.exists() or len(read_text(BACKUP).splitlines()) < 1000:
        shutil.copy2(GLOBALS, BACKUP)
    tailwind, body = extract_tailwind_preamble(original)

    variables, body = extract_root_blocks(body)
    base_rules, body = extract_body_root_rules(body)
    layer_base, body = extract_layer_base(body)
    keyframes, body = extract_keyframes(body)

    base_css = collapse_blank_lines(base_rules.strip()) + "\n"

    write_text(STYLES / "1-settings" / "variables.css", variables)
    write_text(
        STYLES / "1-settings" / "breakpoints.css",
        "/* 响应式断点令牌：后续从 legacy 迁移 @media 变量时填入 */\n",
    )
    write_text(STYLES / "2-reset" / "base.css", base_css)
    write_text(STYLES / "3-generic" / "keyframes.css", keyframes)
    write_text(
        STYLES / "3-generic" / "shared.css",
        "/* 全局通用布局基类：第 2 步从 legacy 迁移 page-route-shell 等 */\n",
    )
    write_text(
        STYLES / "4-components" / ".gitkeep",
        "",
    )
    write_text(
        STYLES / "5-utilities" / "helpers.css",
        "/* 工具类：第 2 步从 legacy 迁移 .tracking-tight 等 */\n",
    )
    write_text(
        STYLES / "5-utilities" / "spacing.css",
        "/* 间距工具类占位 */\n",
    )

    index_css = """\
/* ITCSS 全局入口：低权重 → 高权重，工具类必须最后 */
@import './1-settings/variables.css';
@import './1-settings/breakpoints.css';
@import './2-reset/base.css';
@import './3-generic/keyframes.css';
@import './3-generic/shared.css';
/* 第 2 步起逐步启用组件层与工具层 */
/* @import './4-components/layout-shell.css'; */
@import './5-utilities/spacing.css';
@import './5-utilities/helpers.css';
@import './globals.legacy.css';
"""
    write_text(STYLES / "index.css", index_css)

    legacy = collapse_blank_lines(body.strip()) + "\n"
    write_text(STYLES / "globals.legacy.css", legacy)

    new_globals = tailwind if tailwind.endswith("\n") else tailwind + "\n"
    if layer_base:
        new_globals += "\n" + layer_base
    new_globals += "\n@import './index.css';\n"
    write_text(GLOBALS, new_globals)

    print("Step 0/1 完成:")
    print(f"  备份: {BACKUP.name}")
    print(f"  variables: {len(variables.splitlines())} 行")
    print(f"  base: {len(base_css.splitlines())} 行")
    print(f"  keyframes: {len(keyframes.splitlines())} 行")
    print(f"  legacy: {len(legacy.splitlines())} 行")


if __name__ == "__main__":
    main()
