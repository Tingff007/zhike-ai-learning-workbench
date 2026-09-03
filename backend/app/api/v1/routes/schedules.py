from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.schemas.schedule import (
    LearningScheduleDeleteResponse,
    LearningScheduleItemCreate,
    LearningScheduleItemOut,
    LearningScheduleItemUpdate,
    LearningScheduleListResponse,
)
from app.services.learning.schedule_repository import LearningScheduleRepository

router = APIRouter()


@router.get("", response_model=LearningScheduleListResponse)
async def list_learning_schedules(
    course_id: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    status: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LearningScheduleListResponse:
    """读取当前用户真实保存的学习日程。"""
    items = LearningScheduleRepository(db).list_items(
        user_external_id=current_user.id,
        course_slug=course_id,
        start_date=start_date,
        end_date=end_date,
        status=status,
    )
    return LearningScheduleListResponse(items=items, total=len(items))


@router.post("", response_model=LearningScheduleItemOut)
async def create_learning_schedule(
    payload: LearningScheduleItemCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LearningScheduleItemOut:
    """保存一条学习日程事项。"""
    try:
        return LearningScheduleRepository(db).create_item(user_external_id=current_user.id, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/{item_id}", response_model=LearningScheduleItemOut)
async def update_learning_schedule(
    item_id: str,
    payload: LearningScheduleItemUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LearningScheduleItemOut:
    """更新当前用户的一条学习日程事项。"""
    item = LearningScheduleRepository(db).update_item(user_external_id=current_user.id, item_id=item_id, payload=payload)
    if not item:
        raise HTTPException(status_code=404, detail="学习日程不存在或无权访问")
    return item


@router.delete("/{item_id}", response_model=LearningScheduleDeleteResponse)
async def delete_learning_schedule(
    item_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LearningScheduleDeleteResponse:
    """删除当前用户的一条学习日程事项。"""
    deleted = LearningScheduleRepository(db).delete_item(user_external_id=current_user.id, item_id=item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="学习日程不存在或无权访问")
    return LearningScheduleDeleteResponse(status="deleted", item_id=item_id)
