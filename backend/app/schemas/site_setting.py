from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


LoginBackgroundMediaType = Literal["image", "video"]
LoginBackgroundFit = Literal["cover", "contain"]
LoginBackgroundMediaSource = Literal["built_in", "server_upload"]

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


class LoginBackgroundBase(BaseModel):
    """登录页背景配置的共享字段。"""

    enabled: bool = True
    media_type: LoginBackgroundMediaType = "video"
    media_url: str = Field(default="/auth/login-hero.mp4", min_length=1, max_length=1000)
    fit: LoginBackgroundFit = "cover"
    position_x: int = Field(default=50, ge=0, le=100)
    position_y: int = Field(default=50, ge=0, le=100)
    scale: float = Field(default=1.02, ge=1.0, le=1.35)
    brightness: float = Field(default=0.96, ge=0.5, le=1.4)
    contrast: float = Field(default=1.08, ge=0.5, le=1.6)
    saturate: float = Field(default=1.08, ge=0.0, le=2.0)
    blur: float = Field(default=0.0, ge=0.0, le=12.0)
    overlay_opacity: float = Field(default=0.46, ge=0.0, le=0.85)
    fallback_color: str = Field(default="#b7d8ea", min_length=7, max_length=7)

    @field_validator("media_url")
    @classmethod
    def validate_media_url(cls, value: str) -> str:
        """限制背景媒体地址为站内路径或 http(s) 地址。"""
        stripped = value.strip()
        if not stripped:
            raise ValueError("背景媒体地址不能为空")
        if stripped.startswith(("/", "http://", "https://")):
            return stripped
        raise ValueError("背景媒体地址必须为站内路径或 http(s) 地址")

    @field_validator("fallback_color")
    @classmethod
    def validate_fallback_color(cls, value: str) -> str:
        """校验回退底色为标准 6 位十六进制颜色。"""
        stripped = value.strip()
        if not HEX_COLOR.match(stripped):
            raise ValueError("回退底色必须为 #RRGGBB 格式")
        return stripped


class LoginBackgroundSettings(LoginBackgroundBase):
    """登录页背景配置响应。"""

    updated_at: datetime | None = None
    updated_by: str | None = None


class LoginBackgroundUpdateRequest(BaseModel):
    """管理员更新登录页背景配置请求。"""

    enabled: bool | None = None
    media_type: LoginBackgroundMediaType | None = None
    media_url: str | None = Field(default=None, min_length=1, max_length=1000)
    fit: LoginBackgroundFit | None = None
    position_x: int | None = Field(default=None, ge=0, le=100)
    position_y: int | None = Field(default=None, ge=0, le=100)
    scale: float | None = Field(default=None, ge=1.0, le=1.35)
    brightness: float | None = Field(default=None, ge=0.5, le=1.4)
    contrast: float | None = Field(default=None, ge=0.5, le=1.6)
    saturate: float | None = Field(default=None, ge=0.0, le=2.0)
    blur: float | None = Field(default=None, ge=0.0, le=12.0)
    overlay_opacity: float | None = Field(default=None, ge=0.0, le=0.85)
    fallback_color: str | None = Field(default=None, min_length=7, max_length=7)

    @field_validator("media_url")
    @classmethod
    def validate_media_url(cls, value: str | None) -> str | None:
        """限制背景媒体地址为站内路径或 http(s) 地址。"""
        if value is None:
            return value
        return LoginBackgroundBase.validate_media_url(value)

    @field_validator("fallback_color")
    @classmethod
    def validate_fallback_color(cls, value: str | None) -> str | None:
        """校验回退底色为标准 6 位十六进制颜色。"""
        if value is None:
            return value
        return LoginBackgroundBase.validate_fallback_color(value)


class LoginBackgroundUploadResponse(BaseModel):
    """登录页背景媒体上传响应。"""

    filename: str
    media_url: str
    media_type: LoginBackgroundMediaType
    size: int


class LoginBackgroundMediaAsset(BaseModel):
    """可从服务器选择的登录页背景媒体资源。"""

    filename: str
    media_url: str
    media_type: LoginBackgroundMediaType
    source: LoginBackgroundMediaSource
    size: int | None = None
    updated_at: datetime | None = None


class LoginBackgroundMediaLibraryResponse(BaseModel):
    """登录页背景媒体资源库响应。"""

    items: list[LoginBackgroundMediaAsset]
