from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.schemas.announcement import (
    AdminAnnouncementListResponse,
    AnnouncementCreateRequest,
    AnnouncementDetail,
    AnnouncementMutationResponse,
    AnnouncementStatsResponse,
    AnnouncementUpdateRequest,
)
from app.services.announcement.repository import AnnouncementRepository

router = APIRouter()


def _repository(db: Session) -> AnnouncementRepository:
    """创建公告仓储实例。"""
    return AnnouncementRepository(db)


def _raise_bad_request(exc: ValueError) -> None:
    """把公告业务校验异常转换为 400。"""
    raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/stats", response_model=AnnouncementStatsResponse)
async def announcement_stats(db: Session = Depends(get_db)) -> dict[str, int]:
    """返回管理员公告统计。"""
    return _repository(db).stats()


@router.get("", response_model=AdminAnnouncementListResponse)
async def list_admin_announcements(
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None),
    display_type: str | None = Query(default=None),
    audience_role: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    category: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
) -> AdminAnnouncementListResponse:
    """列出管理员公告台公告。"""
    return AdminAnnouncementListResponse.model_validate(
        _repository(db).list_admin(
            status=status_filter,
            query=q,
            display_type=display_type,
            audience_role=audience_role,
            priority=priority,
            category=category,
            limit=limit,
        )
    )


@router.post("", response_model=AnnouncementDetail, status_code=status.HTTP_201_CREATED)
async def create_admin_announcement(
    payload: AnnouncementCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """创建公告。"""
    try:
        return _repository(db).create(payload, current_user.id)
    except ValueError as exc:
        _raise_bad_request(exc)


@router.get("/{announcement_id}", response_model=AnnouncementDetail)
async def get_admin_announcement(announcement_id: str, db: Session = Depends(get_db)) -> dict:
    """读取管理员公告详情。"""
    item = _repository(db).get_admin(announcement_id)
    if not item:
        raise HTTPException(status_code=404, detail="公告不存在")
    return item


@router.put("/{announcement_id}", response_model=AnnouncementDetail)
async def update_admin_announcement(
    announcement_id: str,
    payload: AnnouncementUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """更新公告。"""
    try:
        item = _repository(db).update(announcement_id, payload, current_user.id)
    except ValueError as exc:
        _raise_bad_request(exc)
    if not item:
        raise HTTPException(status_code=404, detail="公告不存在")
    return item


@router.post("/{announcement_id}/publish", response_model=AnnouncementMutationResponse)
async def publish_admin_announcement(
    announcement_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """发布公告。"""
    item = _repository(db).change_status(announcement_id, "published", current_user.id)
    if not item:
        raise HTTPException(status_code=404, detail="公告不存在")
    return {"status": "published", "announcement_id": item["id"]}


@router.post("/{announcement_id}/archive", response_model=AnnouncementMutationResponse)
async def archive_admin_announcement(
    announcement_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """归档公告。"""
    item = _repository(db).change_status(announcement_id, "archived", current_user.id)
    if not item:
        raise HTTPException(status_code=404, detail="公告不存在")
    return {"status": "archived", "announcement_id": item["id"]}


@router.delete("/{announcement_id}", response_model=AnnouncementMutationResponse)
async def delete_admin_announcement(
    announcement_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """软删除公告。"""
    item = _repository(db).change_status(announcement_id, "deleted", current_user.id)
    if not item:
        raise HTTPException(status_code=404, detail="公告不存在")
    return {"status": "deleted", "announcement_id": item["id"]}
