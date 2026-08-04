from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.schemas.resource import (
    ResourceReviewItem,
    ResourceReviewLogListResponse,
    ResourceReviewQueueResponse,
    ResourceReviewRequest,
    ResourceReviewStats,
)
from app.services.resource.repository import ResourceRepository

router = APIRouter()


@router.get("/review/stats", response_model=ResourceReviewStats)
async def review_stats(course_id: str | None = Query(default=None), db: Session = Depends(get_db)) -> ResourceReviewStats:
    """返回资源审核统计。"""
    return ResourceReviewStats.model_validate(ResourceRepository(db).review_stats(course_id))


@router.get("/review", response_model=ResourceReviewQueueResponse)
async def review_queue(
    course_id: str | None = Query(default=None),
    status: str | None = Query(default="all"),
    db: Session = Depends(get_db),
) -> ResourceReviewQueueResponse:
    """返回资源审核队列。"""
    return ResourceReviewQueueResponse.model_validate({"items": ResourceRepository(db).list_review_queue(course_id, status)})


@router.get("/review/logs", response_model=ResourceReviewLogListResponse)
async def review_logs(
    course_id: str | None = Query(default=None),
    resource_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> ResourceReviewLogListResponse:
    """返回资源审核日志。"""
    return ResourceReviewLogListResponse.model_validate(
        {"items": ResourceRepository(db).list_review_logs(course_id, resource_id, limit)}
    )


@router.get("/review/{resource_id}", response_model=ResourceReviewItem)
async def review_detail(resource_id: str, db: Session = Depends(get_db)) -> ResourceReviewItem:
    """返回单个审核资源详情。"""
    result = ResourceRepository(db).get_review_item(resource_id)
    if not result:
        raise HTTPException(status_code=404, detail="资源不存在或已删除")
    return ResourceReviewItem.model_validate(result)


@router.get("/review/{resource_id}/logs", response_model=ResourceReviewLogListResponse)
async def review_resource_logs(
    resource_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> ResourceReviewLogListResponse:
    """返回单个资源的审核日志。"""
    return ResourceReviewLogListResponse.model_validate(
        {"items": ResourceRepository(db).list_review_logs(resource_code=resource_id, limit=limit)}
    )


@router.post("/review/{resource_id}", response_model=ResourceReviewItem)
async def review_resource(
    resource_id: str,
    payload: ResourceReviewRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceReviewItem:
    """执行资源审核动作并返回更新后的资源详情。"""
    try:
        result = ResourceRepository(db).review_resource(resource_id, payload, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not result:
        raise HTTPException(status_code=404, detail="资源不存在或已删除")
    return ResourceReviewItem.model_validate(result)
