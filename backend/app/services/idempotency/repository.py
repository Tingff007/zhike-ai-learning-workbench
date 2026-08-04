from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.idempotency import IdempotencyKey


class IdempotencyRepository:
    """封装幂等键响应缓存的数据库读写。

    该仓储负责按 scope 与 key 保存接口响应，并在读取时清理过期记录。
    所有写入通过传入的 SQLAlchemy Session 提交。
    """

    def __init__(self, db: Session) -> None:
        """初始化幂等仓储。

        参数:
            db: SQLAlchemy 数据库会话。

        返回:
            None。

        副作用与失败模式:
            本方法仅保存会话引用，不主动访问数据库。
        """

        self.db = db

    @staticmethod
    def _utcnow() -> datetime:
        """返回带 UTC 时区信息的当前时间。"""

        return datetime.now(timezone.utc)

    def get(self, scope: str, key: str) -> dict | None:
        """读取未过期的幂等响应。

        参数:
            scope: 幂等键所属业务范围。
            key: 调用方传入的幂等键。

        返回:
            命中且未过期时返回已缓存的响应字典；key 为空或未命中时返回 None。

        副作用与失败模式:
            读取前会清理过期记录并提交数据库事务；数据库异常会由 SQLAlchemy 向上抛出。
        """

        if not key:
            return None
        self._purge_expired()
        row = self.db.execute(
            select(IdempotencyKey).where(
                IdempotencyKey.scope == scope,
                IdempotencyKey.key == key,
                IdempotencyKey.expires_at > self._utcnow(),
            )
        ).scalar_one_or_none()
        return row.response_json if row else None

    def put(self, scope: str, key: str, response_json: dict, *, ttl_hours: int = 24) -> None:
        """写入或刷新幂等响应缓存。

        参数:
            scope: 幂等键所属业务范围。
            key: 调用方传入的幂等键。
            response_json: 需要缓存的接口响应内容。
            ttl_hours: 缓存有效小时数。

        返回:
            None。

        副作用与失败模式:
            会新增或更新 IdempotencyKey 记录并提交事务；key 为空时直接返回。
            数据库异常会由 SQLAlchemy 向上抛出。
        """

        if not key:
            return
        now = self._utcnow()
        existing = self.db.execute(
            select(IdempotencyKey).where(IdempotencyKey.scope == scope, IdempotencyKey.key == key)
        ).scalar_one_or_none()
        expires_at = now + timedelta(hours=ttl_hours)
        if existing:
            existing.response_json = response_json
            existing.expires_at = expires_at
            self.db.add(existing)
        else:
            self.db.add(
                IdempotencyKey(
                    scope=scope,
                    key=key,
                    response_json=response_json,
                    created_at=now,
                    expires_at=expires_at,
                )
            )
        self.db.commit()

    def _purge_expired(self) -> None:
        """删除已经过期的幂等键记录。

        返回:
            None。

        副作用与失败模式:
            会执行删除语句并提交事务；数据库异常会由 SQLAlchemy 向上抛出。
        """

        self.db.execute(delete(IdempotencyKey).where(IdempotencyKey.expires_at <= self._utcnow()))
        self.db.commit()
