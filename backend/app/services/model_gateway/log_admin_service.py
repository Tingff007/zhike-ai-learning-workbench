from __future__ import annotations

from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.services.model_gateway.log_repository import ClearedCallLogs


class AuditWriter(Protocol):
    """模型网关管理操作审计写入回调。"""

    def __call__(
        self,
        actor_external_id: str | None,
        action: str,
        target: str,
        detail: dict[str, Any],
    ) -> None:
        """写入一条审计记录。"""


class CallLogRepository(Protocol):
    """模型调用日志仓储的最小协议。"""

    def trace_detail(self, trace_id: str) -> dict[str, Any]:
        """查询单个 trace 明细。"""

    def call_logs(
        self,
        capability: str = "all",
        provider: str | None = None,
        status: str | None = None,
        course_id: str | None = None,
        days: int = 7,
        start_at: str | None = None,
        end_at: str | None = None,
        model_name: str | None = None,
        trace_id: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        """查询模型调用日志列表。"""

    def clear_call_logs(
        self,
        *,
        capability: str = "all",
        provider: str | None = None,
        status: str | None = None,
        course_id: str | None = None,
        days: int = 7,
        start_at: str | None = None,
        end_at: str | None = None,
        model_name: str | None = None,
        trace_id: str | None = None,
    ) -> ClearedCallLogs:
        """按筛选条件清理模型调用日志。"""

    def usage_stats(
        self,
        days: int = 30,
        start_at: str | None = None,
        end_at: str | None = None,
        capability: str = "all",
    ) -> dict[str, Any]:
        """查询模型调用用量统计。"""


class ModelGatewayLogAdminService:
    """封装模型调用日志查询、清理、trace 明细和用量统计门面。"""

    def __init__(
        self,
        db: Session,
        *,
        log_repository: CallLogRepository,
        audit: AuditWriter,
    ) -> None:
        """初始化日志管理服务。

        参数:
            db: 当前请求范围内的数据库会话。
            log_repository: 模型调用日志仓储。
            audit: 管理操作审计写入回调。
        """

        self.db = db
        self._log_repository = log_repository
        self._audit = audit

    def trace_detail(self, trace_id: str) -> dict[str, Any]:
        """查询单个 trace 的跨日志明细。"""

        return self._log_repository.trace_detail(trace_id)

    def call_logs(
        self,
        capability: str = "all",
        provider: str | None = None,
        status: str | None = None,
        course_id: str | None = None,
        days: int = 7,
        start_at: str | None = None,
        end_at: str | None = None,
        model_name: str | None = None,
        trace_id: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        """查询模型调用日志列表。"""

        return self._log_repository.call_logs(
            capability=capability,
            provider=provider,
            status=status,
            course_id=course_id,
            days=days,
            start_at=start_at,
            end_at=end_at,
            model_name=model_name,
            trace_id=trace_id,
            limit=limit,
        )

    async def clear_call_logs(
        self,
        *,
        capability: str = "all",
        provider: str | None = None,
        status: str | None = None,
        course_id: str | None = None,
        days: int = 7,
        start_at: str | None = None,
        end_at: str | None = None,
        model_name: str | None = None,
        trace_id: str | None = None,
        actor_external_id: str | None = None,
    ) -> dict[str, Any]:
        """清理模型调用日志，并记录管理员审计。"""

        result = self._clear_logs(
            capability=capability,
            provider=provider,
            status=status,
            course_id=course_id,
            days=days,
            start_at=start_at,
            end_at=end_at,
            model_name=model_name,
            trace_id=trace_id,
        )
        self._audit(
            actor_external_id,
            "model_provider.logs_clear",
            "model_call_logs",
            {
                "deleted": result.deleted,
                "capability": capability,
                "provider": provider,
                "status": status,
                "course_id": course_id,
                "start_at": result.start_bound.isoformat(),
                "end_at": result.end_bound.isoformat(),
                "model_name": model_name,
                "trace_id": trace_id,
            },
        )
        self.db.commit()
        return {"status": "cleared", "deleted": result.deleted}

    def usage_stats(
        self,
        days: int = 30,
        start_at: str | None = None,
        end_at: str | None = None,
        capability: str = "all",
    ) -> dict[str, Any]:
        """为用量统计看板聚合各供应商的调用数据。"""

        return self._log_repository.usage_stats(
            days=days,
            start_at=start_at,
            end_at=end_at,
            capability=capability,
        )

    def _clear_logs(
        self,
        *,
        capability: str,
        provider: str | None,
        status: str | None,
        course_id: str | None,
        days: int,
        start_at: str | None,
        end_at: str | None,
        model_name: str | None,
        trace_id: str | None,
    ) -> ClearedCallLogs:
        """调用仓储执行删除，单独拆出便于测试审计前后的清理结果。"""

        return self._log_repository.clear_call_logs(
            capability=capability,
            provider=provider,
            status=status,
            course_id=course_id,
            days=days,
            start_at=start_at,
            end_at=end_at,
            model_name=model_name,
            trace_id=trace_id,
        )
