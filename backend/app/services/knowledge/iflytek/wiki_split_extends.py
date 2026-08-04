"""ChatDoc 上传 / file.split 使用的 Wiki 切分预设（extend.wikiSplitExtends）。"""

from __future__ import annotations

from typing import Any

# 与 chatdoc.xfyun.cn/docs V2「文档上传 / 文档切分」一致
OFFICIAL_WIKI_SPLIT_EXTENDS_KEYS = frozenset({"chunkSize", "minChunkSize", "chunkSeparators"})

OFFICIAL_WIKI_SPLIT_DEFAULTS: dict[str, Any] = {
    "chunkSize": 2000,
    "minChunkSize": 200,
    "chunkSeparators": ["DQo="],
}

# 与前端 CHATDOC_OFFICIAL_WIKI_SPLIT_PRESET 对齐
TEXTBOOK_PDF_WIKI_SPLIT: dict[str, Any] = dict(OFFICIAL_WIKI_SPLIT_DEFAULTS)


def sanitize_wiki_split_extends(raw: dict[str, Any] | None) -> dict[str, Any]:
    """仅保留官方文档列出的 wikiSplitExtends 字段。

    参数:
        raw: 待清理的切分扩展配置。

    返回:
        只包含官方字段的配置字典；输入为空时返回空字典。
    """
    if not raw:
        return {}
    cleaned: dict[str, Any] = {}
    for key in OFFICIAL_WIKI_SPLIT_EXTENDS_KEYS:
        if key not in raw or raw[key] is None:
            continue
        cleaned[key] = raw[key]
    return cleaned


def merge_wiki_split_extends(
    base: dict[str, Any] | None = None,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """合并默认、基础和覆盖级别的 wikiSplitExtends 配置。

    参数:
        base: 可选的基础切分配置。
        overrides: 可选的覆盖切分配置。

    返回:
        经过官方字段白名单清理后的合并配置。
    """
    merged = {**OFFICIAL_WIKI_SPLIT_DEFAULTS, **(base or {}), **(overrides or {})}
    return sanitize_wiki_split_extends(merged)
