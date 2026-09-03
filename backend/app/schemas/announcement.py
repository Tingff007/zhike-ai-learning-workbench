from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


AnnouncementStatus = Literal["draft", "published", "archived", "deleted"]
AnnouncementPriority = Literal["info", "success", "warning", "critical", "maintenance"]
AnnouncementDisplayType = Literal["top_bar", "modal", "page_card", "toast", "list_only"]
AnnouncementAudience = Literal["all", "student", "admin"]


class AnnouncementBase(BaseModel):
    """公告创建与编辑的共享字段。"""

    title: str = Field(min_length=1, max_length=180)
    summary: str = Field(default="", max_length=500)
    body: str = Field(default="", max_length=20000)
    category: str = Field(default="system", min_length=1, max_length=64)
    priority: AnnouncementPriority = "info"
    display_type: AnnouncementDisplayType = "list_only"
    audience_role: AnnouncementAudience = "all"
    pinned: bool = False
    dismissible: bool = True
    require_confirmation: bool = False
    auto_dismiss_seconds: int | None = Field(default=None, ge=1, le=60)
    action_label: str | None = Field(default=None, max_length=80)
    action_url: str | None = Field(default=None, max_length=500)
    effective_at: datetime | None = None
    expires_at: datetime | None = None


class AnnouncementCreateRequest(AnnouncementBase):
    """管理员创建公告请求。"""

    status: AnnouncementStatus = "draft"


class AnnouncementUpdateRequest(BaseModel):
    """管理员更新公告请求，未传字段保持原值。"""

    title: str | None = Field(default=None, min_length=1, max_length=180)
    summary: str | None = Field(default=None, max_length=500)
    body: str | None = Field(default=None, max_length=20000)
    category: str | None = Field(default=None, min_length=1, max_length=64)
    priority: AnnouncementPriority | None = None
    display_type: AnnouncementDisplayType | None = None
    audience_role: AnnouncementAudience | None = None
    status: AnnouncementStatus | None = None
    pinned: bool | None = None
    dismissible: bool | None = None
    require_confirmation: bool | None = None
    auto_dismiss_seconds: int | None = Field(default=None, ge=1, le=60)
    action_label: str | None = Field(default=None, max_length=80)
    action_url: str | None = Field(default=None, max_length=500)
    effective_at: datetime | None = None
    expires_at: datetime | None = None


class AnnouncementDismissRequest(BaseModel):
    """用户关闭公告展示请求。"""

    display_type: AnnouncementDisplayType


class AnnouncementItem(BaseModel):
    """公告列表项响应。"""

    id: str
    title: str
    summary: str
    category: str
    priority: str
    display_type: str
    audience_role: str
    status: str
    pinned: bool
    dismissible: bool
    require_confirmation: bool
    auto_dismiss_seconds: int | None = None
    action_label: str | None = None
    action_url: str | None = None
    effective_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    is_read: bool = False
    is_dismissed: bool = False
    is_active: bool = False
    read_count: int | None = None
    dismissal_count: int | None = None


class AnnouncementDetail(AnnouncementItem):
    """公告详情响应。"""

    body: str


class AnnouncementListResponse(BaseModel):
    """用户公告列表响应。"""

    items: list[AnnouncementItem]
    total: int
    unread_count: int


class AdminAnnouncementListResponse(BaseModel):
    """管理员公告列表响应。"""

    items: list[AnnouncementDetail]
    total: int


class AnnouncementSummaryResponse(BaseModel):
    """用户工作台公告主动展示摘要。"""

    unread_count: int
    top_bar: AnnouncementItem | None = None
    modal: AnnouncementItem | None = None
    page_cards: list[AnnouncementItem] = Field(default_factory=list)
    toast_items: list[AnnouncementItem] = Field(default_factory=list)


class AnnouncementMutationResponse(BaseModel):
    """公告写操作响应。"""

    status: str
    announcement_id: str | None = None
    unread_count: int | None = None


class AnnouncementStatsResponse(BaseModel):
    """管理员公告统计响应。"""

    total: int
    draft: int
    published: int
    archived: int
    deleted: int
    active: int
    critical: int
    unread_total: int
