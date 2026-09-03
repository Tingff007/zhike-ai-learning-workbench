from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_admin
from app.schemas.site_setting import (
    LoginBackgroundMediaLibraryResponse,
    LoginBackgroundSettings,
    LoginBackgroundUpdateRequest,
    LoginBackgroundUploadResponse,
)
from app.services.site_settings import SiteSettingRepository, list_login_background_media_assets, save_login_background_upload

router = APIRouter()
admin_router = APIRouter()


@router.get("/login-background", response_model=LoginBackgroundSettings)
async def login_background(db: Session = Depends(get_db)) -> LoginBackgroundSettings:
    """公开读取登录页背景配置。"""
    return SiteSettingRepository(db).get_login_background()


@admin_router.get("/login-background", response_model=LoginBackgroundSettings)
async def admin_login_background(
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> LoginBackgroundSettings:
    """管理员读取登录页背景配置。"""
    return SiteSettingRepository(db).get_login_background()


@admin_router.put("/login-background", response_model=LoginBackgroundSettings)
async def update_admin_login_background(
    payload: LoginBackgroundUpdateRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> LoginBackgroundSettings:
    """管理员保存登录页背景配置。"""
    return SiteSettingRepository(db).update_login_background(payload, actor_external_id=current_user.id)


@admin_router.get("/login-background/media", response_model=LoginBackgroundMediaLibraryResponse)
async def list_admin_login_background_media(
    current_user: CurrentUser = Depends(require_admin),
) -> LoginBackgroundMediaLibraryResponse:
    """管理员列出可选的服务器登录页背景媒体。"""
    return list_login_background_media_assets()


@admin_router.post("/login-background/media", response_model=LoginBackgroundUploadResponse)
async def upload_admin_login_background_media(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_admin),
) -> LoginBackgroundUploadResponse:
    """管理员上传登录页背景媒体。"""
    return await save_login_background_upload(file)
