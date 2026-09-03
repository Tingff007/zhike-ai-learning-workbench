from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.schemas.announcement import (
    AnnouncementDetail,
    AnnouncementDismissRequest,
    AnnouncementListResponse,
    AnnouncementMutationResponse,
    AnnouncementSummaryResponse,
)
from app.services.announcement.repository import AnnouncementRepository

router = APIRouter()


def _repository(db: Session) -> AnnouncementRepository:
    """创建公告仓储实例。"""
    return AnnouncementRepository(db)


def _raise_login_error(exc: ValueError) -> None:
    """把仓储层用户缺失异常转换成登录错误。"""
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc


@router.get("/summary", response_model=AnnouncementSummaryResponse)
async def announcement_summary(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """返回当前用户工作台公告摘要。"""
    try:
        return _repository(db).summary(current_user.id, current_user.role)
    except ValueError as exc:
        _raise_login_error(exc)


@router.post("/read-all", response_model=AnnouncementMutationResponse)
async def read_all_announcements(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """标记当前用户可见公告全部已读。"""
    try:
        return _repository(db).mark_all_read(current_user.id, current_user.role)
    except ValueError as exc:
        _raise_login_error(exc)


@router.get("", response_model=AnnouncementListResponse)
async def list_announcements(
    category: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    display_type: str | None = Query(default=None),
    unread_only: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """列出当前用户可见的历史公告。"""
    try:
        return _repository(db).list_visible(
            current_user.id,
            current_user.role,
            category=category,
            priority=priority,
            display_type=display_type,
            unread_only=unread_only,
            limit=limit,
        )
    except ValueError as exc:
        _raise_login_error(exc)


@router.get("/{announcement_id}", response_model=AnnouncementDetail)
async def get_announcement(
    announcement_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """读取公告详情。"""
    try:
        item = _repository(db).get_visible(announcement_id, current_user.id, current_user.role)
    except ValueError as exc:
        _raise_login_error(exc)
    if not item:
        raise HTTPException(status_code=404, detail="公告不存在或不可访问")
    return item


@router.post("/{announcement_id}/read", response_model=AnnouncementMutationResponse)
async def read_announcement(
    announcement_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """标记单条公告已读并确认。"""
    try:
        result = _repository(db).mark_read(announcement_id, current_user.id, confirmed=True)
    except ValueError as exc:
        _raise_login_error(exc)
    if result["status"] == "not_found":
        raise HTTPException(status_code=404, detail="公告不存在")
    return result


@router.post("/{announcement_id}/dismiss", response_model=AnnouncementMutationResponse)
async def dismiss_announcement(
    announcement_id: str,
    payload: AnnouncementDismissRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """记录用户关闭公告展示。"""
    try:
        result = _repository(db).dismiss(announcement_id, current_user.id, payload.display_type)
    except ValueError as exc:
        _raise_login_error(exc)
    if result["status"] == "not_found":
        raise HTTPException(status_code=404, detail="公告不存在")
    return result
