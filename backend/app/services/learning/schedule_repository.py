from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Course, CourseConcept, LearningScheduleItem, Resource, User
from app.schemas.schedule import LearningScheduleItemCreate, LearningScheduleItemOut, LearningScheduleItemUpdate
from app.services.learning.events import LearningEventRecorder


class LearningScheduleRepository:
    """管理真实可保存的学习日程事项。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_items(
        self,
        *,
        user_external_id: str,
        course_slug: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        status: str | None = None,
    ) -> list[LearningScheduleItemOut]:
        """按用户、课程和日期范围读取学习日程。"""
        user = self._user(user_external_id)
        if not user:
            return []
        query = select(LearningScheduleItem, Course).outerjoin(Course, Course.id == LearningScheduleItem.course_id).where(LearningScheduleItem.user_id == user.id)
        if course_slug:
            course = self._course(course_slug)
            if not course:
                return []
            query = query.where(LearningScheduleItem.course_id == course.id)
        if start_date:
            query = query.where(LearningScheduleItem.scheduled_date >= start_date)
        if end_date:
            query = query.where(LearningScheduleItem.scheduled_date <= end_date)
        if status:
            query = query.where(LearningScheduleItem.status == status)
        rows = self.db.execute(query.order_by(LearningScheduleItem.scheduled_date, LearningScheduleItem.priority.desc(), LearningScheduleItem.created_at)).all()
        return [self._to_out(item, course) for item, course in rows]

    def create_item(self, *, user_external_id: str, payload: LearningScheduleItemCreate) -> LearningScheduleItemOut:
        """创建学习日程事项并写入学习事件。"""
        user = self._require_user(user_external_id)
        course = self._course(payload.course_id) if payload.course_id else None
        concept = self._concept(course, payload.concept_id) if course and payload.concept_id else None
        resource = self._resource(payload.resource_id) if payload.resource_id else None
        item = LearningScheduleItem(
            user_id=user.id,
            course_id=course.id if course else None,
            concept_id=concept.id if concept else None,
            resource_id=resource.id if resource else None,
            path_node_id=payload.path_node_id,
            source_type=payload.source_type,
            source_id=payload.source_id,
            item_type=payload.item_type,
            title=payload.title.strip(),
            description=payload.description,
            scheduled_date=payload.scheduled_date,
            time_label=payload.time_label,
            status="planned",
            priority=payload.priority,
            meta_json=payload.meta_json,
        )
        self.db.add(item)
        self.db.flush()
        self._record_event(item, "schedule_item_created")
        self.db.commit()
        self.db.refresh(item)
        return self._to_out(item, course)

    def update_item(self, *, user_external_id: str, item_id: str, payload: LearningScheduleItemUpdate) -> LearningScheduleItemOut | None:
        """更新学习日程事项；完成状态会写入学习事件。"""
        user = self._user(user_external_id)
        if not user:
            return None
        item = self._item_for_user(item_id, user)
        if not item:
            return None
        previous_status = item.status
        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        if payload.title is not None:
            item.title = payload.title.strip()
        if payload.status and payload.status != previous_status:
            self._record_event(item, "schedule_item_completed" if payload.status == "completed" else "schedule_item_status_updated")
        self.db.commit()
        self.db.refresh(item)
        return self._to_out(item, self.db.get(Course, item.course_id) if item.course_id else None)

    def delete_item(self, *, user_external_id: str, item_id: str) -> bool:
        """删除当前用户的学习日程事项。"""
        user = self._user(user_external_id)
        if not user:
            return False
        item = self._item_for_user(item_id, user)
        if not item:
            return False
        self.db.delete(item)
        self.db.commit()
        return True

    def _record_event(self, item: LearningScheduleItem, event_type: str) -> None:
        """把日程变化沉淀为学习事件，供画像和进度报告使用。"""
        if not item.course_id:
            return
        LearningEventRecorder(self.db).record(
            course_id=item.course_id,
            user_id=item.user_id,
            concept_id=item.concept_id,
            event_type=event_type,
            source_type="learning_schedule",
            source_id=str(item.id),
            evidence={
                "title": item.title,
                "scheduled_date": item.scheduled_date.isoformat(),
                "status": item.status,
                "item_type": item.item_type,
                "path_node_id": item.path_node_id,
                "source_type": item.source_type,
                "source_id": item.source_id,
            },
        )

    def _user(self, external_id: str) -> User | None:
        return self.db.execute(select(User).where(User.external_id == external_id)).scalar_one_or_none()

    def _require_user(self, external_id: str) -> User:
        user = self._user(external_id)
        if not user:
            raise ValueError("当前用户不存在")
        return user

    def _course(self, slug: str | None) -> Course | None:
        if not slug:
            return None
        return self.db.execute(select(Course).where(Course.slug == slug)).scalar_one_or_none()

    def _concept(self, course: Course, concept_code: str | None) -> CourseConcept | None:
        if not concept_code:
            return None
        return self.db.execute(select(CourseConcept).where(CourseConcept.course_id == course.id, CourseConcept.code == concept_code)).scalar_one_or_none()

    def _resource(self, resource_id: str | None) -> Resource | None:
        if not resource_id:
            return None
        try:
            return self.db.get(Resource, UUID(resource_id))
        except ValueError:
            return None

    def _item_for_user(self, item_id: str, user: User) -> LearningScheduleItem | None:
        try:
            item_uuid = UUID(item_id)
        except ValueError:
            return None
        return self.db.execute(
            select(LearningScheduleItem).where(LearningScheduleItem.id == item_uuid, LearningScheduleItem.user_id == user.id)
        ).scalar_one_or_none()

    @staticmethod
    def _to_out(item: LearningScheduleItem, course: Course | None) -> LearningScheduleItemOut:
        """把数据库行转换为前端稳定响应。"""
        return LearningScheduleItemOut(
            id=str(item.id),
            course_id=course.slug if course else None,
            course_title=course.title if course else None,
            concept_id=str(item.concept_id) if item.concept_id else None,
            path_node_id=item.path_node_id,
            resource_id=str(item.resource_id) if item.resource_id else None,
            source_type=item.source_type,
            source_id=item.source_id,
            item_type=item.item_type,
            title=item.title,
            description=item.description,
            scheduled_date=item.scheduled_date,
            time_label=item.time_label,
            status=item.status,
            priority=item.priority,
            meta_json=item.meta_json or {},
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
