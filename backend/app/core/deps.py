from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.database import get_db
from app.core.security import hash_token
from app.models import Course, CourseMembership, Session as UserSession, User


@dataclass
class CurrentUser:
    """当前请求解析出的最小用户上下文。"""

    id: str
    name: str
    role: str
    email: str | None = None


async def get_current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> CurrentUser:
    """从 Bearer token 解析当前登录用户。"""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录")

    token = authorization.split(" ", 1)[1].strip()
    current_user = resolve_user_from_token(db, token)
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录状态已失效，请重新登录")
    return current_user


def resolve_user_from_token(db: Session, token: str) -> CurrentUser | None:
    """按会话 token 查询有效用户，失效或撤销时返回 None。"""
    row = db.execute(
        select(UserSession, User)
        .join(User, User.id == UserSession.user_id)
        .where(UserSession.refresh_token_hash == hash_token(token), UserSession.revoked.is_(False), User.status == "active")
    ).first()
    if not row:
        return None

    _session, user = row
    return CurrentUser(id=user.external_id, name=user.display_name, role=user.role_code, email=user.email)


async def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """要求当前用户具备管理员角色。"""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="当前账号没有管理权限")
    return current_user


def course_filter(course_id: str) -> ColumnElement[bool]:
    """按课程 slug 或 UUID 构造课程过滤条件。"""
    clauses = [Course.slug == course_id]
    try:
        clauses.append(Course.id == uuid.UUID(str(course_id)))
    except ValueError:
        pass
    return or_(*clauses)


def ensure_course_access(db: Session, current_user: CurrentUser, course_id: str) -> None:
    """后端：学生可以直接选择已发布课程，并自动记录学习关系

    管理员保持全权限；学生可访问已发布课程（draft/删除/归档课程仍不可用）
    """
    if current_user.role == "admin":
        return

    user = db.execute(select(User).where(User.external_id == current_user.id)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=403, detail="请先登录后再选择课程")

    course = db.execute(select(Course).where(course_filter(course_id), Course.status != "deleted")).scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在或已被删除")
    if course.status != "published":
        raise HTTPException(status_code=403, detail="当前课程暂不可用，可能尚未发布或已下架")

    membership = db.execute(
        select(CourseMembership).where(
            CourseMembership.user_id == user.id,
            CourseMembership.course_id == course.id,
        )
    ).scalar_one_or_none()
    if membership:
        if membership.status != "active":
            membership.status = "active"
            db.commit()
        return

    db.add(CourseMembership(course_id=course.id, user_id=user.id, role="student", status="active"))
    db.commit()

async def require_ta(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """要求当前用户具备助教或管理员角色。"""
    if current_user.role not in ('ta', 'admin'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前账号没有助教权限')
    return current_user
