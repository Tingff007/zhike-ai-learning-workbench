from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.models.chatdoc_vendor_quota import ChatdocVendorQuota
from app.schemas.chatdoc_vendor_quota import (
    ChatdocVendorQuotaItem,
    ChatdocVendorQuotaResetUsed,
    ChatdocVendorQuotaUpsert,
    ChatdocVendorQuotaView,
)

IFLYTEK_CHATDOC_QUOTA_KEY = "iflytek-chatdoc"

MIGRATION_HINT = "请执行数据库迁移：cd backend && alembic upgrade head（需包含 0028_chatdoc_vendor_quota）"


class ChatdocVendorQuotaNotReadyError(RuntimeError):
    """表示 ChatDoc 供应商余量表尚未创建。

    参数：
        与 RuntimeError 相同，通常传入数据库迁移提示。

    返回：
        异常类本身不返回值，用于调用方识别余量表未就绪的失败模式。

    副作用与失败模式：
        抛出该异常表示当前数据库缺少 chatdoc_vendor_quotas 表，需要先执行对应 Alembic 迁移。
    """

DEDUCTION_RULES: dict[str, tuple[str, str, str]] = {
    "upload": (
        "文件上传",
        "页",
        "讯飞官方：按 file/upload 返回的 quantity（页数）累计；PDF/DOC 按自然页，超长页可能多计。",
    ),
    "doc_qa": (
        "文档问答",
        "次",
        "讯飞官方：§3.3 WebSocket 文档问答每次成功调用扣 1 次（智课主链路用 vector/search，不计入此项）。",
    ),
    "extract": (
        "文件萃取",
        "次",
        "讯飞官方：萃取任务每次成功调用扣 1 次。",
    ),
}


def parse_upload_quantity(payload: dict[str, Any]) -> int:
    """从 ChatDoc 上传响应中解析消耗页数。

    参数：
        payload: 供应商上传接口返回的响应字典。

    返回：
        非负整数页数；quantity 缺失、为空或无法解析时返回 0。

    副作用与失败模式：
        不修改输入对象，不访问数据库；异常格式会被兜底为 0。
    """
    raw = payload.get("quantity")
    if raw is None:
        return 0
    try:
        value = int(float(str(raw).strip()))
    except (TypeError, ValueError):
        return 0
    return max(0, value)


def _utilization(used: int, limit: int | None) -> float | None:
    if limit is None or limit <= 0:
        return None
    return round(min(100.0, (used / limit) * 100.0), 1)


def _remaining(used: int, limit: int | None) -> int | None:
    if limit is None:
        return None
    return max(0, limit - used)


def try_get_quota_view(db: Session, integration_key: str) -> ChatdocVendorQuotaView | None:
    """尝试读取指定接入实例的供应商余量视图。

    参数：
        db: SQLAlchemy 数据库会话。
        integration_key: 接入实例 key。

    返回：
        余量视图；余量表未迁移时返回 None。

    副作用与失败模式：
        可能创建默认余量行并 flush 数据库；除表未就绪外的数据库异常会继续向外抛出。
    """
    try:
        return ChatdocVendorQuotaService(db).get_view(integration_key)
    except ChatdocVendorQuotaNotReadyError:
        return None


class ChatdocVendorQuotaService:
    """管理讯飞 ChatDoc 供应商套餐余量与本地扣减计数。

    参数：
        db: SQLAlchemy 数据库会话，用于读取和写入供应商余量记录。

    副作用：
        方法可能创建余量行、更新额度上限、重置已用量或记录供应商调用消耗。

    失败模式：
        余量表未迁移时抛出 ChatdocVendorQuotaNotReadyError；其他数据库错误由 SQLAlchemy 向外抛出。
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def _ensure_row(self, integration_key: str = IFLYTEK_CHATDOC_QUOTA_KEY) -> ChatdocVendorQuota:
        try:
            row = self.db.get(ChatdocVendorQuota, integration_key)
        except ProgrammingError as exc:
            self.db.rollback()
            if "chatdoc_vendor_quotas" in str(exc).lower():
                raise ChatdocVendorQuotaNotReadyError(MIGRATION_HINT) from exc
            raise
        if row is None:
            row = ChatdocVendorQuota(integration_key=integration_key)
            self.db.add(row)
            try:
                self.db.flush()
            except ProgrammingError as exc:
                self.db.rollback()
                if "chatdoc_vendor_quotas" in str(exc).lower():
                    raise ChatdocVendorQuotaNotReadyError(MIGRATION_HINT) from exc
                raise
        return row

    def get_view(self, integration_key: str = IFLYTEK_CHATDOC_QUOTA_KEY) -> ChatdocVendorQuotaView:
        """读取指定接入实例的供应商余量展示视图。

        参数：
            integration_key: 接入实例 key，默认使用讯飞 ChatDoc 主实例 key。

        返回：
            包含上传、文档问答和文件萃取三类用量的 ChatdocVendorQuotaView。

        副作用与失败模式：
            记录不存在时会创建默认余量行并 flush；余量表未迁移时抛出 ChatdocVendorQuotaNotReadyError。
        """
        row = self._ensure_row(integration_key)
        items = [
            ChatdocVendorQuotaItem(
                key="upload",
                label=DEDUCTION_RULES["upload"][0],
                unit=DEDUCTION_RULES["upload"][1],
                used=int(row.upload_used_pages or 0),
                limit=row.upload_limit_pages,
                remaining=_remaining(int(row.upload_used_pages or 0), row.upload_limit_pages),
                utilization_pct=_utilization(int(row.upload_used_pages or 0), row.upload_limit_pages),
                deduction_rule=DEDUCTION_RULES["upload"][2],
            ),
            ChatdocVendorQuotaItem(
                key="doc_qa",
                label=DEDUCTION_RULES["doc_qa"][0],
                unit=DEDUCTION_RULES["doc_qa"][1],
                used=int(row.doc_qa_used or 0),
                limit=row.doc_qa_limit,
                remaining=_remaining(int(row.doc_qa_used or 0), row.doc_qa_limit),
                utilization_pct=_utilization(int(row.doc_qa_used or 0), row.doc_qa_limit),
                deduction_rule=DEDUCTION_RULES["doc_qa"][2],
            ),
            ChatdocVendorQuotaItem(
                key="extract",
                label=DEDUCTION_RULES["extract"][0],
                unit=DEDUCTION_RULES["extract"][1],
                used=int(row.extract_used or 0),
                limit=row.extract_limit,
                remaining=_remaining(int(row.extract_used or 0), row.extract_limit),
                utilization_pct=_utilization(int(row.extract_used or 0), row.extract_limit),
                deduction_rule=DEDUCTION_RULES["extract"][2],
            ),
        ]
        updated_at = row.updated_at.isoformat() if row.updated_at else None
        return ChatdocVendorQuotaView(
            integration_key=row.integration_key,
            package_note=row.package_note,
            items=items,
            updated_at=updated_at,
        )

    def upsert_limits(
        self,
        payload: ChatdocVendorQuotaUpsert,
        *,
        actor_external_id: str | None = None,
        integration_key: str = IFLYTEK_CHATDOC_QUOTA_KEY,
    ) -> ChatdocVendorQuotaView:
        """新增或更新指定接入实例的供应商套餐上限。

        参数：
            payload: 管理端提交的额度上限和套餐备注。
            actor_external_id: 执行操作的外部用户标识，用于记录最后更新者。
            integration_key: 接入实例 key，默认使用讯飞 ChatDoc 主实例 key。

        返回：
            更新后的供应商余量展示视图。

        副作用与失败模式：
            会写入额度上限、备注、更新时间和操作者并提交事务；余量表未迁移时抛出 ChatdocVendorQuotaNotReadyError。
        """
        row = self._ensure_row(integration_key)
        if payload.upload_limit_pages is not None:
            row.upload_limit_pages = payload.upload_limit_pages
        if payload.doc_qa_limit is not None:
            row.doc_qa_limit = payload.doc_qa_limit
        if payload.extract_limit is not None:
            row.extract_limit = payload.extract_limit
        if payload.package_note is not None:
            row.package_note = payload.package_note.strip() or None
        row.updated_by_external_id = actor_external_id
        row.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        return self.get_view(integration_key)

    def reset_used(
        self,
        payload: ChatdocVendorQuotaResetUsed,
        *,
        actor_external_id: str | None = None,
        integration_key: str = IFLYTEK_CHATDOC_QUOTA_KEY,
    ) -> ChatdocVendorQuotaView:
        """重置指定接入实例的供应商已用量。

        参数：
            payload: 管理端提交的已用量重置值，未提供的字段保持不变。
            actor_external_id: 执行操作的外部用户标识，用于记录最后更新者。
            integration_key: 接入实例 key，默认使用讯飞 ChatDoc 主实例 key。

        返回：
            重置后的供应商余量展示视图。

        副作用与失败模式：
            会写入已用量、更新时间和操作者并提交事务；余量表未迁移时抛出 ChatdocVendorQuotaNotReadyError。
        """
        row = self._ensure_row(integration_key)
        if payload.upload_used_pages is not None:
            row.upload_used_pages = payload.upload_used_pages
        if payload.doc_qa_used is not None:
            row.doc_qa_used = payload.doc_qa_used
        if payload.extract_used is not None:
            row.extract_used = payload.extract_used
        row.updated_by_external_id = actor_external_id
        row.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        return self.get_view(integration_key)

    def record_upload_pages(
        self,
        pages: int,
        *,
        integration_key: str = IFLYTEK_CHATDOC_QUOTA_KEY,
    ) -> None:
        """记录 ChatDoc 文件上传消耗页数。

        参数：
            pages: 本次上传消耗的页数，非正数会被忽略。
            integration_key: 接入实例 key，默认使用讯飞 ChatDoc 主实例 key。

        返回：
            None。

        副作用与失败模式：
            pages 为正数时会累加上传已用页数、更新时间并 flush；余量表未迁移时抛出 ChatdocVendorQuotaNotReadyError。
        """
        if pages <= 0:
            return
        row = self._ensure_row(integration_key)
        row.upload_used_pages = int(row.upload_used_pages or 0) + pages
        row.updated_at = datetime.now(timezone.utc)
        self.db.flush()

    def record_doc_qa(self, *, integration_key: str = IFLYTEK_CHATDOC_QUOTA_KEY) -> None:
        """记录一次 ChatDoc 文档问答消耗。

        参数：
            integration_key: 接入实例 key，默认使用讯飞 ChatDoc 主实例 key。

        返回：
            None。

        副作用与失败模式：
            会累加文档问答已用次数、更新时间并 flush；余量表未迁移时抛出 ChatdocVendorQuotaNotReadyError。
        """
        row = self._ensure_row(integration_key)
        row.doc_qa_used = int(row.doc_qa_used or 0) + 1
        row.updated_at = datetime.now(timezone.utc)
        self.db.flush()

    def record_extract(self, *, integration_key: str = IFLYTEK_CHATDOC_QUOTA_KEY) -> None:
        """记录一次 ChatDoc 文件萃取消耗。

        参数：
            integration_key: 接入实例 key，默认使用讯飞 ChatDoc 主实例 key。

        返回：
            None。

        副作用与失败模式：
            会累加文件萃取已用次数、更新时间并 flush；余量表未迁移时抛出 ChatdocVendorQuotaNotReadyError。
        """
        row = self._ensure_row(integration_key)
        row.extract_used = int(row.extract_used or 0) + 1
        row.updated_at = datetime.now(timezone.utc)
        self.db.flush()

    def ensure_for_integration(self, integration_key: str) -> None:
        """确保指定接入实例存在供应商余量记录。

        参数：
            integration_key: 接入实例 key。

        返回：
            None。

        副作用与失败模式：
            记录不存在时会创建默认余量行并 flush；余量表未迁移时抛出 ChatdocVendorQuotaNotReadyError。
        """
        self._ensure_row(integration_key)
