from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


ScheduleItemStatus = Literal["planned", "completed", "skipped"]


class LearningScheduleItemCreate(BaseModel):
    """创建学习日程事项的请求体。"""

    course_id: str | None = None
    concept_id: str | None = None
    path_node_id: str | None = None
    resource_id: str | None = None
    source_type: str = "manual"
    source_id: str | None = None
    item_type: str = "focus"
    title: str = Field(min_length=1, max_length=240)
    description: str | None = None
    scheduled_date: date
    time_label: str | None = Field(default=None, max_length=32)
    priority: int = Field(default=50, ge=0, le=100)
    meta_json: dict[str, Any] = Field(default_factory=dict)


class LearningScheduleItemUpdate(BaseModel):
    """更新学习日程事项的请求体。"""

    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = None
    scheduled_date: date | None = None
    time_label: str | None = Field(default=None, max_length=32)
    status: ScheduleItemStatus | None = None
    priority: int | None = Field(default=None, ge=0, le=100)
    meta_json: dict[str, Any] | None = None


class LearningScheduleItemOut(BaseModel):
    """学习日程事项响应。"""

    id: str
    course_id: str | None = None
    course_title: str | None = None
    concept_id: str | None = None
    path_node_id: str | None = None
    resource_id: str | None = None
    source_type: str
    source_id: str | None = None
    item_type: str
    title: str
    description: str | None = None
    scheduled_date: date
    time_label: str | None = None
    status: ScheduleItemStatus | str
    priority: int
    meta_json: dict[str, Any]
    created_at: datetime | None = None
    updated_at: datetime | None = None


class LearningScheduleListResponse(BaseModel):
    """学习日程列表响应。"""

    items: list[LearningScheduleItemOut]
    total: int


class LearningScheduleDeleteResponse(BaseModel):
    """学习日程删除响应。"""

    status: str
    item_id: str
