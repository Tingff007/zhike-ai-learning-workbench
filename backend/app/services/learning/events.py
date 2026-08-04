from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models import LearningEvent


class LearningEventRecorder:
    """产品学习闭环使用的追加式证据日志记录器。"""

    def __init__(self, db: Session) -> None:
        """保存数据库会话，用于追加学习事件记录。"""
        self.db = db

    def record(
        self,
        *,
        course_id: uuid.UUID,
        user_id: uuid.UUID | None = None,
        concept_id: uuid.UUID | None = None,
        event_type: str,
        source_type: str | None = None,
        source_id: str | None = None,
        evidence: dict[str, Any] | None = None,
        flush: bool = True,
    ) -> LearningEvent:
        """记录一条学习事件并按需刷新数据库会话。

        参数:
            course_id: 事件所属课程 ID。
            user_id: 触发事件的用户 ID，系统级事件可为空。
            concept_id: 事件关联的知识点 ID，可为空。
            event_type: 学习事件类型。
            source_type: 事件来源类型，例如测评、路径节点或资源任务。
            source_id: 来源对象标识，会在写入前转换为字符串。
            evidence: 事件证据载荷，缺省时写入空对象。
            flush: 是否立即 flush 以便调用方获得事件主键。

        返回:
            已加入当前数据库会话的学习事件模型。
        """
        event = LearningEvent(
            course_id=course_id,
            user_id=user_id,
            concept_id=concept_id,
            event_type=event_type,
            source_type=source_type,
            source_id=str(source_id) if source_id is not None else None,
            evidence_json=evidence or {},
        )
        self.db.add(event)
        if flush:
            self.db.flush()
        return event
