from __future__ import annotations

import logging
from pathlib import Path

from fastapi import HTTPException

from app.core.config import settings
from app.services.knowledge.iflytek.upload_utils import is_chatdoc_upload_filename

logger = logging.getLogger(__name__)


class DocumentUploadValidationError(ValueError):
    """validate_document_upload_bytes 抛出的校验错误，由路由映射为 HTTP 状态码。"""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def validate_document_upload_bytes(filename: str, mime_type: str | None, content: bytes) -> None:
    """云端上传前校验文件大小、扩展名、MIME 和基础可读性。"""
    size_bytes = len(content)
    if size_bytes <= 0:
        raise DocumentUploadValidationError("上传文件不能为空")
    max_bytes = settings.MAX_DOCUMENT_UPLOAD_BYTES
    if size_bytes > max_bytes:
        limit_mb = max_bytes // 1024 // 1024
        raise DocumentUploadValidationError(
            f"文件超过大小限制，当前上限为 {limit_mb} MB",
            status_code=413,
        )

    suffix = Path(filename or "").suffix.lower()
    if suffix not in settings.allowed_document_extensions_set:
        raise DocumentUploadValidationError("不支持的文件类型")
    if not is_chatdoc_upload_filename(filename):
        raise DocumentUploadValidationError("当前云端入库仅支持 PDF、Markdown、TXT 格式。")

    normalized_mime = (mime_type or "application/octet-stream").lower().split(";")[0].strip()
    if normalized_mime not in settings.allowed_document_mime_types_set:
        raise DocumentUploadValidationError("不支持的文件 MIME 类型")

    if suffix == ".pdf":
        _validate_pdf_bytes(content)
    elif suffix in {".txt", ".text", ".md", ".markdown"}:
        _validate_text_bytes(content, suffix)


def _validate_pdf_bytes(content: bytes) -> None:
    try:
        import fitz  # type: ignore
    except ImportError as exc:
        raise DocumentUploadValidationError("服务端缺少 PDF 校验依赖（PyMuPDF）") from exc

    doc = None
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        if doc.needs_pass:
            raise DocumentUploadValidationError("PDF 已加密或需要打开密码，请先解密后再上传")
        if doc.page_count < 1:
            raise DocumentUploadValidationError("PDF 无有效页面，请检查文件内容")
    except DocumentUploadValidationError:
        raise
    except Exception:
        logger.debug(
            "PDF 文件基础校验失败，将按不可读文件处理：content_size=%s",
            len(content),
            exc_info=True,
        )
        raise DocumentUploadValidationError("PDF 文件无法读取或已损坏")
    finally:
        if doc is not None:
            doc.close()


def _validate_text_bytes(content: bytes, suffix: str) -> None:
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        if suffix in {".md", ".markdown"}:
            raise DocumentUploadValidationError("Markdown 文件须为 UTF-8 编码")
        try:
            text = content.decode("gb18030")
        except UnicodeDecodeError:
            raise DocumentUploadValidationError("文本文件编码无法识别，请另存为 UTF-8 后重试")
    if not text.strip():
        raise DocumentUploadValidationError("文本文件无有效内容（仅空白字符）")
