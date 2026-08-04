from __future__ import annotations

from pathlib import Path

CHATDOC_UPLOAD_SUFFIXES: frozenset[str] = frozenset({".pdf", ".md", ".markdown", ".txt", ".text"})


def is_chatdoc_upload_filename(filename: str) -> bool:
    """判断文件名是否属于 ChatDoc 支持上传的文本类文件。

    参数:
        filename: 用户上传文件名。

    返回:
        后缀在允许列表中返回 True，否则返回 False。
    """
    return Path(filename or "").suffix.lower() in CHATDOC_UPLOAD_SUFFIXES


def guess_upload_mime_type(filename: str, mime_type: str | None = None) -> str:
    """根据上传文件名和浏览器 MIME 值推断最终提交类型。

    参数:
        filename: 用户上传文件名。
        mime_type: 浏览器或客户端传入的 MIME 类型。

    返回:
        可提交给 ChatDoc 的 MIME 类型，无法识别时按纯文本处理。
    """
    normalized = (mime_type or "").lower().split(";")[0].strip()
    if normalized and normalized != "application/octet-stream":
        return normalized
    suffix = Path(filename or "").suffix.lower()
    if suffix == ".pdf":
        return "application/pdf"
    if suffix in {".md", ".markdown"}:
        return "text/markdown"
    return "text/plain"


def chatdoc_parse_type(filename: str) -> str:
    """根据文件后缀选择 ChatDoc 解析类型。

    参数:
        filename: 用户上传文件名。

    返回:
        PDF 使用 AUTO，其余文本类文件使用 TEXT。
    """
    suffix = Path(filename or "").suffix.lower()
    if suffix == ".pdf":
        return "AUTO"
    return "TEXT"
