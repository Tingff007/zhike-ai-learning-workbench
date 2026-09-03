from __future__ import annotations

from pathlib import Path

from app.core.config import settings


def save_document_file(*, course_slug: str, filename: str, content: bytes, content_hash: str) -> str:
    """把上传文档保存到本地对象存储目录。

    参数:
        course_slug: 课程 slug，用于隔离不同课程的文档目录。
        filename: 原始文件名，会被清洗为适合文件系统保存的名称。
        content: 文件二进制内容。
        content_hash: 文件内容哈希，用于构造稳定且可去重的文件名前缀。

    返回:
        已写入文件的绝对路径字符串。

    副作用/失败:
        会创建课程文档目录并写入文件；目录创建或文件写入失败时抛出底层 OSError。
    """
    safe_name = "".join(char if char.isalnum() or char in {".", "-", "_"} else "_" for char in filename)[:160] or "document"
    root = Path(settings.OBJECT_STORAGE_ROOT).expanduser().resolve() / "documents" / course_slug
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{content_hash[:12]}_{safe_name}"
    path.write_bytes(content)
    return str(path)
