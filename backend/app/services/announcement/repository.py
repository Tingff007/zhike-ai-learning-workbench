from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.models import Announcement, AnnouncementDismissal, AnnouncementRead, User
from app.schemas.announcement import AnnouncementCreateRequest, AnnouncementUpdateRequest


PRIORITY_WEIGHT = {
    "critical": 50,
    "maintenance": 40,
    "warning": 30,
    "success": 20,
    "info": 10,
}


class AnnouncementRepository:
    """封装公告用户侧读取、已读关闭记录和管理员 CRUD。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_visible(
        self,
        user_external_id: str,
        role: str,
        *,
        category: str | None = None,
        priority: str | None = None,
        display_type: str | None = None,
        unread_only: bool = False,
        limit: int = 100,
    ) -> dict[str, Any]:
        """列出当前用户可见的历史公告。"""
        user = self._require_user(user_external_id)
        items = self._visible_rows(role, active_only=False, category=category, priority=priority, display_type=display_type, limit=limit)
        read_ids = self._read_ids(user.id)
        dismissals = self._dismissal_keys(user.id)
        visible_items = [
            self._to_dict(item, user_id=user.id, read_ids=read_ids, dismissals=dismissals)
            for item in items
            if not unread_only or item.id not in read_ids
        ]
        unread_count = self._unread_count(user.id, role)
        return {"items": visible_items, "total": len(visible_items), "unread_count": unread_count}

    def summary(self, user_external_id: str, role: str) -> dict[str, Any]:
        """返回工作台需要主动展示的公告摘要。"""
        user = self._require_user(user_external_id)
        rows = self._visible_rows(role, active_only=True, limit=80)
        read_ids = self._read_ids(user.id)
        dismissals = self._dismissal_keys(user.id)
        items = [self._to_dict(item, user_id=user.id, read_ids=read_ids, dismissals=dismissals) for item in rows]
        active_items = [item for item in items if not item["is_dismissed"]]
        return {
            "unread_count": self._unread_count(user.id, role),
            "top_bar": self._first_by_display(active_items, "top_bar"),
            "modal": self._first_by_display(active_items, "modal"),
            "page_cards": [item for item in active_items if item["display_type"] == "page_card"][:3],
            "toast_items": [item for item in active_items if item["display_type"] == "toast"][:2],
        }

    def get_visible(self, announcement_id: str, user_external_id: str, role: str) -> dict[str, Any] | None:
        """读取当前用户可访问的公告详情。"""
        user = self._require_user(user_external_id)
        row = self._announcement(announcement_id)
        if not row or not self._is_visible_to_role(row, role, active_only=False):
            return None
        read_ids = self._read_ids(user.id)
        dismissals = self._dismissal_keys(user.id)
        return self._to_dict(row, user_id=user.id, read_ids=read_ids, dismissals=dismissals, include_body=True)

    def mark_read(self, announcement_id: str, user_external_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        """幂等标记公告已读或已确认。"""
        user = self._require_user(user_external_id)
        announcement = self._announcement(announcement_id)
        if not announcement:
            return {"status": "not_found", "announcement_id": announcement_id}
        row = self.db.execute(
            select(AnnouncementRead).where(
                AnnouncementRead.announcement_id == announcement.id,
                AnnouncementRead.user_id == user.id,
            )
        ).scalar_one_or_none()
        if not row:
            row = AnnouncementRead(announcement_id=announcement.id, user_id=user.id)
            self.db.add(row)
        if confirmed:
            row.confirmed_at = datetime.now(UTC)
        self.db.commit()
        return {"status": "ok", "announcement_id": str(announcement.id)}

    def dismiss(self, announcement_id: str, user_external_id: str, display_type: str) -> dict[str, Any]:
        """记录当前用户关闭某种公告展示形式。"""
        user = self._require_user(user_external_id)
        announcement = self._announcement(announcement_id)
        if not announcement:
            return {"status": "not_found", "announcement_id": announcement_id}
        row = self.db.execute(
            select(AnnouncementDismissal).where(
                AnnouncementDismissal.announcement_id == announcement.id,
                AnnouncementDismissal.user_id == user.id,
                AnnouncementDismissal.display_type == display_type,
            )
        ).scalar_one_or_none()
        if not row:
            self.db.add(AnnouncementDismissal(announcement_id=announcement.id, user_id=user.id, display_type=display_type))
        self.db.commit()
        return {"status": "ok", "announcement_id": str(announcement.id)}

    def mark_all_read(self, user_external_id: str, role: str) -> dict[str, Any]:
        """标记当前用户可见公告全部已读。"""
        user = self._require_user(user_external_id)
        rows = self._visible_rows(role, active_only=False, limit=500)
        read_ids = self._read_ids(user.id)
        for item in rows:
            if item.id not in read_ids:
                self.db.add(AnnouncementRead(announcement_id=item.id, user_id=user.id))
        self.db.commit()
        return {"status": "ok", "unread_count": self._unread_count(user.id, role)}

    def list_admin(
        self,
        *,
        status: str | None = None,
        query: str | None = None,
        display_type: str | None = None,
        audience_role: str | None = None,
        priority: str | None = None,
        category: str | None = None,
        limit: int = 200,
    ) -> dict[str, Any]:
        """列出管理员公告台数据。"""
        stmt = select(Announcement)
        if status and status != "all":
            stmt = stmt.where(Announcement.status == status)
        if display_type and display_type != "all":
            stmt = stmt.where(Announcement.display_type == display_type)
        if audience_role and audience_role != "all":
            stmt = stmt.where(Announcement.audience_role == audience_role)
        if priority and priority != "all":
            stmt = stmt.where(Announcement.priority == priority)
        if category:
            stmt = stmt.where(Announcement.category == category)
        if query:
            like = f"%{query.strip()}%"
            stmt = stmt.where(or_(Announcement.title.ilike(like), Announcement.summary.ilike(like), Announcement.body.ilike(like)))
        rows = self.db.execute(stmt.order_by(Announcement.updated_at.desc()).limit(max(1, min(limit, 500)))).scalars().all()
        return {"items": [self._to_admin_dict(item) for item in rows], "total": len(rows)}

    def get_admin(self, announcement_id: str) -> dict[str, Any] | None:
        """读取管理员公告详情。"""
        row = self._announcement(announcement_id)
        return self._to_admin_dict(row, include_body=True) if row else None

    def create(self, payload: AnnouncementCreateRequest, admin_external_id: str) -> dict[str, Any]:
        """创建公告草稿或直接发布公告。"""
        self._validate_time_window(payload.effective_at, payload.expires_at)
        admin = self._require_user(admin_external_id)
        row = Announcement(**payload.model_dump(), created_by_user_id=admin.id, updated_by_user_id=admin.id)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._to_admin_dict(row, include_body=True)

    def update(self, announcement_id: str, payload: AnnouncementUpdateRequest, admin_external_id: str) -> dict[str, Any] | None:
        """更新公告配置。"""
        row = self._announcement(announcement_id)
        if not row:
            return None
        values = payload.model_dump(exclude_unset=True)
        effective_at = values.get("effective_at", row.effective_at)
        expires_at = values.get("expires_at", row.expires_at)
        self._validate_time_window(effective_at, expires_at)
        admin = self._require_user(admin_external_id)
        for key, value in values.items():
            setattr(row, key, value)
        row.updated_by_user_id = admin.id
        self.db.commit()
        self.db.refresh(row)
        return self._to_admin_dict(row, include_body=True)

    def change_status(self, announcement_id: str, status: str, admin_external_id: str) -> dict[str, Any] | None:
        """切换公告状态。"""
        row = self._announcement(announcement_id)
        if not row:
            return None
        admin = self._require_user(admin_external_id)
        row.status = status
        row.updated_by_user_id = admin.id
        if status == "deleted":
            row.deleted_at = datetime.now(UTC)
        self.db.commit()
        self.db.refresh(row)
        return self._to_admin_dict(row, include_body=True)

    def stats(self) -> dict[str, int]:
        """汇总管理员公告统计。"""
        rows = self.db.execute(select(Announcement.status, func.count(Announcement.id)).group_by(Announcement.status)).all()
        counts = {str(status): int(count) for status, count in rows}
        total = int(self.db.execute(select(func.count(Announcement.id))).scalar_one() or 0)
        now = datetime.now(UTC)
        active = int(
            self.db.execute(
                select(func.count(Announcement.id)).where(
                    Announcement.status == "published",
                    Announcement.deleted_at.is_(None),
                    or_(Announcement.effective_at.is_(None), Announcement.effective_at <= now),
                    or_(Announcement.expires_at.is_(None), Announcement.expires_at > now),
                )
            ).scalar_one()
            or 0
        )
        critical = int(
            self.db.execute(
                select(func.count(Announcement.id)).where(
                    Announcement.priority == "critical",
                    Announcement.status == "published",
                    Announcement.deleted_at.is_(None),
                )
            ).scalar_one()
            or 0
        )
        reads = int(self.db.execute(select(func.count(AnnouncementRead.id))).scalar_one() or 0)
        published = counts.get("published", 0)
        return {
            "total": total,
            "draft": counts.get("draft", 0),
            "published": published,
            "archived": counts.get("archived", 0),
            "deleted": counts.get("deleted", 0),
            "active": active,
            "critical": critical,
            "unread_total": max(0, published - reads),
        }

    def _visible_rows(
        self,
        role: str,
        *,
        active_only: bool,
        category: str | None = None,
        priority: str | None = None,
        display_type: str | None = None,
        limit: int,
    ) -> list[Announcement]:
        now = datetime.now(UTC)
        stmt = select(Announcement).where(
            Announcement.status == "published",
            Announcement.deleted_at.is_(None),
            Announcement.audience_role.in_(["all", role]),
            or_(Announcement.effective_at.is_(None), Announcement.effective_at <= now),
        )
        if active_only:
            stmt = stmt.where(or_(Announcement.expires_at.is_(None), Announcement.expires_at > now))
        if category:
            stmt = stmt.where(Announcement.category == category)
        if priority:
            stmt = stmt.where(Announcement.priority == priority)
        if display_type:
            stmt = stmt.where(Announcement.display_type == display_type)
        weight = case(PRIORITY_WEIGHT, value=Announcement.priority, else_=0)
        return list(
            self.db.execute(
                stmt.order_by(Announcement.pinned.desc(), weight.desc(), Announcement.effective_at.desc().nullslast(), Announcement.created_at.desc())
                .limit(max(1, min(limit, 500)))
            ).scalars().all()
        )

    def _is_visible_to_role(self, row: Announcement, role: str, *, active_only: bool) -> bool:
        now = datetime.now(UTC)
        if row.status != "published" or row.deleted_at is not None:
            return False
        if row.audience_role not in {"all", role}:
            return False
        if row.effective_at and row.effective_at > now:
            return False
        if active_only and row.expires_at and row.expires_at <= now:
            return False
        return True

    def _unread_count(self, user_id: uuid.UUID, role: str) -> int:
        rows = self._visible_rows(role, active_only=True, limit=500)
        read_ids = self._read_ids(user_id)
        return sum(1 for item in rows if item.id not in read_ids)

    def _read_ids(self, user_id: uuid.UUID) -> set[uuid.UUID]:
        return set(
            self.db.execute(select(AnnouncementRead.announcement_id).where(AnnouncementRead.user_id == user_id)).scalars().all()
        )

    def _dismissal_keys(self, user_id: uuid.UUID) -> set[tuple[uuid.UUID, str]]:
        rows = self.db.execute(
            select(AnnouncementDismissal.announcement_id, AnnouncementDismissal.display_type).where(AnnouncementDismissal.user_id == user_id)
        ).all()
        return {(announcement_id, display_type) for announcement_id, display_type in rows}

    def _announcement(self, announcement_id: str) -> Announcement | None:
        safe_id = self._safe_uuid(announcement_id)
        if not safe_id:
            return None
        return self.db.get(Announcement, safe_id)

    def _user(self, external_id: str) -> User | None:
        return self.db.execute(select(User).where(User.external_id == external_id)).scalar_one_or_none()

    def _require_user(self, external_id: str) -> User:
        user = self._user(external_id)
        if not user:
            raise ValueError("用户不存在，请重新登录")
        return user

    @staticmethod
    def _safe_uuid(value: str | None) -> uuid.UUID | None:
        if not value:
            return None
        try:
            return uuid.UUID(str(value))
        except ValueError:
            return None

    @staticmethod
    def _validate_time_window(effective_at: datetime | None, expires_at: datetime | None) -> None:
        if effective_at and expires_at and effective_at >= expires_at:
            raise ValueError("过期时间必须晚于生效时间")

    @staticmethod
    def _first_by_display(items: list[dict[str, Any]], display_type: str) -> dict[str, Any] | None:
        return next((item for item in items if item["display_type"] == display_type), None)

    def _to_dict(
        self,
        item: Announcement,
        *,
        user_id: uuid.UUID,
        read_ids: set[uuid.UUID],
        dismissals: set[tuple[uuid.UUID, str]],
        include_body: bool = False,
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        payload = self._base_dict(item, include_body=include_body)
        payload.update(
            {
                "is_read": item.id in read_ids,
                "is_dismissed": (item.id, item.display_type) in dismissals,
                "is_active": self._is_visible_to_role(item, "all" if item.audience_role == "all" else item.audience_role, active_only=True)
                and (item.effective_at is None or item.effective_at <= now)
                and (item.expires_at is None or item.expires_at > now),
            }
        )
        return payload

    def _to_admin_dict(self, item: Announcement, *, include_body: bool = True) -> dict[str, Any]:
        payload = self._base_dict(item, include_body=include_body)
        payload.update(
            {
                "is_read": False,
                "is_dismissed": False,
                "is_active": self._is_visible_to_role(item, "all" if item.audience_role == "all" else item.audience_role, active_only=True),
                "read_count": int(
                    self.db.execute(
                        select(func.count(AnnouncementRead.id)).where(AnnouncementRead.announcement_id == item.id)
                    ).scalar_one()
                    or 0
                ),
                "dismissal_count": int(
                    self.db.execute(
                        select(func.count(AnnouncementDismissal.id)).where(AnnouncementDismissal.announcement_id == item.id)
                    ).scalar_one()
                    or 0
                ),
            }
        )
        return payload

    @staticmethod
    def _base_dict(item: Announcement, *, include_body: bool) -> dict[str, Any]:
        payload = {
            "id": str(item.id),
            "title": item.title,
            "summary": item.summary or "",
            "category": item.category,
            "priority": item.priority,
            "display_type": item.display_type,
            "audience_role": item.audience_role,
            "status": item.status,
            "pinned": item.pinned,
            "dismissible": item.dismissible,
            "require_confirmation": item.require_confirmation,
            "auto_dismiss_seconds": item.auto_dismiss_seconds,
            "action_label": item.action_label,
            "action_url": item.action_url,
            "effective_at": item.effective_at,
            "expires_at": item.expires_at,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
        if include_body:
            payload["body"] = item.body or ""
        return payload
