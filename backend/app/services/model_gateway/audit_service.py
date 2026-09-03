from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.tracing import get_trace_id
from app.models import AdminAuditLog, User


class ModelGatewayAuditService:
    """封装模型网关管理操作审计写入逻辑。"""

    def __init__(self, db: Session) -> None:
        """初始化审计服务。

        参数:
            db: 当前请求范围内的数据库会话。
        """

        self.db = db

    def write(self, actor_external_id: str | None, action: str, target_id: str, detail: dict[str, Any]) -> None:
        """写入一条模型网关管理员操作审计记录。

        参数:
            actor_external_id: 当前管理员的外部用户 ID，匿名系统操作可为空。
            action: 审计动作编码。
            target_id: 被操作对象的业务标识。
            detail: 审计详情，方法会自动补充 trace_id。
        """

        actor_id = None
        if actor_external_id:
            actor = self.db.execute(select(User).where(User.external_id == actor_external_id)).scalar_one_or_none()
            actor_id = actor.id if actor else None
        audit_detail = {**detail, "trace_id": detail.get("trace_id") or get_trace_id()}
        self.db.add(
            AdminAuditLog(
                actor_user_id=actor_id,
                action=action,
                target_type="model_provider",
                target_id=target_id,
                detail_json=audit_detail,
            )
        )
