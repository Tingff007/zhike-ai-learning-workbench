from __future__ import annotations

import json
import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.config import settings

ALLOWED_ICON_EXTENSIONS = {".svg", ".png", ".webp", ".jpg", ".jpeg"}
MAX_ICON_BYTES = 256 * 1024
SAFE_FILENAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")

_DEFAULT_ICONS: dict[str, str] = {
    "iflytek.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">
  <rect width="64" height="64" rx="14" fill="#0ea5e9"/>
  <path fill="#fff" d="M18 42V22h6.8l5.2 14.2L35.2 22H42v20h-5.6V30.4L31.6 42h-4.8l-4.8-11.6V42H18zm28-12.4c0 7.4-5.4 12.8-12.6 12.8S20.8 37 20.8 29.6 26.2 17 33.4 17s12.6 5.2 12.6 12.6zm-5.6 0c0-4.4-3-7.4-7-7.4s-7 3-7 7.4 3 7.4 7 7.4 7-3 7-7.4z"/>
</svg>""",
    "aliyun.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">
  <rect width="64" height="64" rx="14" fill="#ff6a00"/>
  <path fill="#fff" d="M18 44V20h9.2c6.8 0 11.2 3.6 11.2 9.4 0 4-2.4 7-6.2 8.4L42 44h-7.2l-7.8-12.2V44H18zm9-18.8v7.6h2.8c2.8 0 4.4-1.2 4.4-3.8s-1.6-3.8-4.4-3.8H27z"/>
</svg>""",
    "zhipu.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">
  <rect width="64" height="64" rx="14" fill="#6366f1"/>
  <path fill="#fff" d="M20 44V20h8.4c7.2 0 12 4.4 12 12s-4.8 12-12 12H20zm8-18.4c-3.6 0-5.6 2-5.6 6.4s2 6.4 5.6 6.4 5.6-2 5.6-6.4-2-6.4-5.6-6.4z"/>
</svg>""",
    "ollama.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">
  <rect width="64" height="64" rx="14" fill="#111827"/>
  <circle cx="32" cy="30" r="12" fill="#fff"/>
  <rect x="22" y="42" width="20" height="8" rx="4" fill="#fff"/>
</svg>""",
    "openai.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">
  <rect width="64" height="64" rx="14" fill="#10a37f"/>
  <path fill="#fff" d="M32 18c8.4 0 14 5.2 14 12.2 0 4.8-2.6 8.4-7 10.2l6.2 9.6H36l-5.4-8.6h-1.2V50H22V18h10zm-2.2 16.8h2.4c3.8 0 6-2 6-5.6s-2.2-5.6-6-5.6h-2.4v11.2z"/>
</svg>""",
    "generic.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">
  <rect width="64" height="64" rx="14" fill="#64748b"/>
  <path fill="#fff" d="M22 42V22h20v5.6H27.6V30h12.4v5.6H27.6V42H22z"/>
</svg>""",
}


def icons_dir() -> Path:
    """返回模型供应商图标目录，并确保目录存在。"""
    root = Path(settings.MODEL_PROVIDER_ICONS_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def icon_public_url(filename: str) -> str:
    """根据图标文件名构造可由前端访问的静态资源 URL。"""
    return f"{settings.API_V1_PREFIX}/static/provider-icons/{filename}"


_DELETED_MANIFEST = ".deleted-icons.json"


def _deleted_manifest_path() -> Path:
    return icons_dir() / _DELETED_MANIFEST


def _load_deleted_icons() -> set[str]:
    path = _deleted_manifest_path()
    if not path.is_file():
        return set()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return set()
    if not isinstance(payload, list):
        return set()
    return {str(item) for item in payload if isinstance(item, str) and SAFE_FILENAME.match(item)}


def _save_deleted_icons(names: set[str]) -> None:
    path = _deleted_manifest_path()
    path.write_text(json.dumps(sorted(names), ensure_ascii=False, indent=2), encoding="utf-8")


def ensure_default_icons() -> None:
    """写入缺失的默认供应商图标，尊重用户已删除的默认图标清单。"""
    directory = icons_dir()
    deleted = _load_deleted_icons()
    for filename, content in _DEFAULT_ICONS.items():
        if filename in deleted:
            continue
        target = directory / filename
        if not target.exists():
            target.write_text(content.strip(), encoding="utf-8")


def list_icons() -> list[dict[str, str]]:
    """列出当前可用的供应商图标文件及其访问地址。"""
    items: list[dict[str, str]] = []
    for path in sorted(icons_dir().iterdir()):
        if not path.is_file():
            continue
        if path.name.startswith("."):
            continue
        if path.suffix.lower() not in ALLOWED_ICON_EXTENSIONS:
            continue
        items.append({
            "filename": path.name,
            "url": icon_public_url(path.name),
            "deletable": True,
        })
    return items


def delete_icon(filename: str) -> dict[str, str]:
    """删除指定供应商图标，并记录被删除的默认图标。"""
    candidate = Path(filename).name
    if not SAFE_FILENAME.match(candidate):
        raise HTTPException(status_code=400, detail="非法文件名")
    target = icons_dir() / candidate
    if not target.is_file():
        raise HTTPException(status_code=404, detail="图标不存在")
    target.unlink()
    if candidate in _DEFAULT_ICONS:
        deleted = _load_deleted_icons()
        deleted.add(candidate)
        _save_deleted_icons(deleted)
    return {"filename": candidate, "status": "deleted"}


def _sanitize_upload_name(filename: str) -> str:
    stem = Path(filename).stem.strip().lower().replace(" ", "-")
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_ICON_EXTENSIONS:
        raise HTTPException(status_code=400, detail="仅支持 svg、png、webp、jpg 图标")
    safe_stem = re.sub(r"[^a-z0-9._-]", "", stem) or "provider"
    return f"{safe_stem}-{uuid.uuid4().hex[:8]}{suffix}"


async def save_icon_upload(file: UploadFile) -> dict[str, str]:
    """保存管理端上传的供应商图标。

    参数:
        file: FastAPI 上传文件对象。

    返回:
        保存后的文件名和静态访问地址。

    异常:
        HTTPException: 文件名缺失、文件为空、文件过大或扩展名不支持时抛出。
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="缺少文件名")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="图标文件为空")
    if len(content) > MAX_ICON_BYTES:
        raise HTTPException(status_code=400, detail="图标文件不能超过 256KB")

    filename = _sanitize_upload_name(file.filename)
    target = icons_dir() / filename
    target.write_bytes(content)
    return {"filename": filename, "url": icon_public_url(filename)}


def resolve_icon_file(meta_json: dict[str, object] | None) -> str | None:
    """从供应商元数据中解析安全可用的图标文件名。"""
    if not meta_json:
        return None
    icon_file = meta_json.get("icon_file")
    if not isinstance(icon_file, str) or not icon_file.strip():
        return None
    candidate = Path(icon_file).name
    if not SAFE_FILENAME.match(candidate):
        return None
    if not (icons_dir() / candidate).is_file():
        return None
    return candidate
