from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

from fastapi import HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import SiteSetting
from app.schemas.site_setting import (
    LoginBackgroundMediaAsset,
    LoginBackgroundMediaLibraryResponse,
    LoginBackgroundSettings,
    LoginBackgroundMediaType,
    LoginBackgroundUpdateRequest,
    LoginBackgroundUploadResponse,
)


LOGIN_BACKGROUND_KEY = "login_background"
SAFE_FILENAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$")

BACKGROUND_MEDIA_RULES: dict[str, dict[str, set[str]]] = {
    "image": {
        "extensions": {".png", ".jpg", ".jpeg", ".webp", ".gif"},
        "mime_types": {"image/png", "image/jpeg", "image/webp", "image/gif"},
    },
    "video": {
        "extensions": {".mp4", ".webm"},
        "mime_types": {"video/mp4", "video/webm"},
    },
}

BUILT_IN_BACKGROUND_ASSETS: tuple[LoginBackgroundMediaAsset, ...] = (
    LoginBackgroundMediaAsset(
        filename="login-hero.mp4",
        media_url="/auth/login-hero.mp4",
        media_type="video",
        source="built_in",
    ),
)


def site_assets_dir() -> Path:
    """返回站点静态资源目录，并确保目录存在。"""
    root = Path(settings.SITE_ASSETS_DIR).expanduser()
    root.mkdir(parents=True, exist_ok=True)
    return root


def site_asset_public_url(filename: str) -> str:
    """生成站点静态资源的公开访问路径。"""
    return f"{settings.API_V1_PREFIX}/static/site-assets/{filename}"


def ensure_site_assets_dir() -> Path:
    """启动时确保站点静态资源目录可用。"""
    return site_assets_dir()


def _default_login_background_payload() -> dict[str, Any]:
    """生成默认登录页背景配置字典。"""
    return LoginBackgroundSettings().model_dump(exclude={"updated_at", "updated_by"})


def _media_type_from_suffix(suffix: str) -> str:
    """根据扩展名识别登录背景媒体类型。"""
    return next(
        (
            rule_media_type
            for rule_media_type, rule in BACKGROUND_MEDIA_RULES.items()
            if suffix in rule["extensions"]
        ),
        "",
    )


class SiteSettingRepository:
    """封装站点级配置读取和更新。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_login_background(self) -> LoginBackgroundSettings:
        """读取登录页背景配置，缺省时返回内置背景视频。"""
        row = self.db.get(SiteSetting, LOGIN_BACKGROUND_KEY)
        return self._to_login_background(row)

    def update_login_background(
        self,
        payload: LoginBackgroundUpdateRequest,
        *,
        actor_external_id: str,
    ) -> LoginBackgroundSettings:
        """保存管理员调整后的登录页背景配置。"""
        row = self.db.get(SiteSetting, LOGIN_BACKGROUND_KEY)
        current = self._to_login_background(row).model_dump(exclude={"updated_at", "updated_by"})
        next_value = {**current, **payload.model_dump(exclude_unset=True)}
        validated = LoginBackgroundSettings(**next_value)
        if row is None:
            row = SiteSetting(
                key=LOGIN_BACKGROUND_KEY,
                value_json=validated.model_dump(exclude={"updated_at", "updated_by"}),
                updated_by=actor_external_id,
            )
            self.db.add(row)
        else:
            row.value_json = validated.model_dump(exclude={"updated_at", "updated_by"})
            row.updated_by = actor_external_id
        self.db.commit()
        self.db.refresh(row)
        return self._to_login_background(row)

    @staticmethod
    def _to_login_background(row: SiteSetting | None) -> LoginBackgroundSettings:
        """把数据库配置转换为登录页背景响应模型。"""
        payload = _default_login_background_payload()
        if row and isinstance(row.value_json, dict):
            payload.update(row.value_json)
        try:
            return LoginBackgroundSettings(
                **payload,
                updated_at=row.updated_at if row else None,
                updated_by=row.updated_by if row else None,
            )
        except ValidationError:
            return LoginBackgroundSettings()


def _sanitize_background_filename(filename: str) -> tuple[str, str]:
    """清洗上传文件名，并返回安全文件名与媒体类型。"""
    suffix = Path(filename).suffix.lower()
    media_type = _media_type_from_suffix(suffix)
    if not media_type:
        raise HTTPException(status_code=400, detail="登录背景仅支持 PNG、JPEG、WebP、GIF、MP4、WebM")
    stem = re.sub(r"[^a-zA-Z0-9._-]", "", Path(filename).stem.strip().replace(" ", "-").lower()) or "login-background"
    safe_name = f"{stem}-{uuid.uuid4().hex[:10]}{suffix}"
    if not SAFE_FILENAME.match(safe_name):
        raise HTTPException(status_code=400, detail="背景文件名不合法")
    return safe_name, media_type


def _validate_upload_mime(file: UploadFile, media_type: str) -> None:
    """根据媒体类型校验上传文件 MIME。"""
    content_type = (file.content_type or "").lower()
    if not content_type or content_type == "application/octet-stream":
        return
    if content_type not in BACKGROUND_MEDIA_RULES[media_type]["mime_types"]:
        raise HTTPException(status_code=400, detail="上传文件类型与扩展名不匹配")


def list_login_background_media_assets() -> LoginBackgroundMediaLibraryResponse:
    """列出可从服务器直接选择的登录页背景媒体资源。"""
    assets: list[LoginBackgroundMediaAsset] = []
    for path in site_assets_dir().iterdir():
        if not path.is_file():
            continue
        media_type = _media_type_from_suffix(path.suffix.lower())
        if not media_type:
            continue
        stat = path.stat()
        assets.append(
            LoginBackgroundMediaAsset(
                filename=path.name,
                media_url=site_asset_public_url(path.name),
                media_type=cast(LoginBackgroundMediaType, media_type),
                source="server_upload",
                size=stat.st_size,
                updated_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
            )
        )
    assets.sort(key=lambda item: item.updated_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    assets.extend(BUILT_IN_BACKGROUND_ASSETS)
    return LoginBackgroundMediaLibraryResponse(items=assets)


async def save_login_background_upload(file: UploadFile) -> LoginBackgroundUploadResponse:
    """保存登录页背景媒体并返回可写入配置的访问地址。"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="缺少文件名")
    filename, media_type = _sanitize_background_filename(file.filename)
    _validate_upload_mime(file, media_type)
    content = await file.read(settings.AUTH_BACKGROUND_MAX_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="背景文件为空")
    if len(content) > settings.AUTH_BACKGROUND_MAX_BYTES:
        raise HTTPException(status_code=413, detail="背景文件过大，请压缩后再上传")
    target = site_assets_dir() / filename
    target.write_bytes(content)
    return LoginBackgroundUploadResponse(
        filename=filename,
        media_url=site_asset_public_url(filename),
        media_type=cast(LoginBackgroundMediaType, media_type),
        size=len(content),
    )
