from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

import sqlalchemy as sa
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.models import Course, ModelCallLog, ModelProvider


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ClearedCallLogs:
    """模型调用日志清理结果。"""

    deleted: int
    start_bound: datetime
    end_bound: datetime


class ModelGatewayCallConfig(Protocol):
    """写入模型调用日志所需的供应商配置最小字段。"""

    id: Any | None
    provider: str
    key_source: str
    chat_model: str
    embedding_model: str | None
    image_model: str | None


class ModelGatewayLogRepository:
    """封装模型调用日志、用量统计和 trace 明细查询。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def record_call(
        self,
        *,
        course_slug: str | None,
        config: ModelGatewayCallConfig,
        agent_name: str,
        latency_ms: int,
        status: str,
        capability: str,
        estimated_cost: dict[str, Any],
        trace_id: str,
        error: str | None = None,
        request_count: int = 1,
        batch_count: int = 1,
        embedding_dim: int | None = None,
        token_input: int = 0,
        token_output: int = 0,
        meta_json: dict[str, Any] | None = None,
    ) -> None:
        """写入单次模型调用日志，并在失败时记录可排障的 warning。"""
        try:
            course_id = None
            if course_slug:
                course = self.db.execute(
                    select(Course).where(or_(Course.slug == course_slug, Course.id == self._safe_uuid_text(course_slug)))
                ).scalar_one_or_none()
                course_id = course.id if course else None
            log_meta = {
                "provider": config.provider,
                "key_source": config.key_source,
                "trace_id": trace_id,
                "estimated_cost": estimated_cost.get("estimated_cost", 0),
                "currency": estimated_cost.get("currency", "CNY"),
            }
            if meta_json:
                log_meta.update(meta_json)
            self.db.add(
                ModelCallLog(
                    course_id=course_id,
                    provider_id=config.id,
                    agent_name=agent_name,
                    capability=capability,
                    model_name=self._model_name_for_capability(config, capability),
                    request_count=request_count,
                    batch_count=batch_count,
                    embedding_dim=embedding_dim,
                    token_input=token_input,
                    token_output=token_output,
                    latency_ms=latency_ms,
                    status=status,
                    error_message=error[:1000] if error else None,
                    meta_json=log_meta,
                )
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.warning(
                "记录模型调用日志失败：provider=%s capability=%s status=%s model=%s trace_id=%s",
                config.provider,
                capability,
                status,
                self._model_name_for_capability(config, capability),
                trace_id,
                exc_info=True,
            )

    def trace_detail(self, trace_id: str) -> dict[str, Any]:
        """按 trace_id 汇总模型调用、RAG 查询和后台审计明细。"""
        model_rows = self.db.execute(
            select(ModelCallLog, ModelProvider, Course)
            .outerjoin(ModelProvider, ModelProvider.id == ModelCallLog.provider_id)
            .outerjoin(Course, Course.id == ModelCallLog.course_id)
            .where(ModelCallLog.meta_json["trace_id"].astext == trace_id)
            .order_by(ModelCallLog.created_at.asc())
        ).all()
        rag_rows = self.db.execute(
            sa.text(
                """
                SELECT r.id, c.slug AS course_slug, c.title AS course_title, r.intent, r.hit,
                       r.top_score, r.citation_count, r.refused, r.latency_ms, r.query_text,
                       r.created_at, r.meta_json
                FROM rag_query_logs r
                LEFT JOIN courses c ON c.id = r.course_id
                WHERE r.meta_json->>'trace_id' = :trace_id
                ORDER BY r.created_at ASC
                """
            ),
            {"trace_id": trace_id},
        ).mappings().all()
        audit_rows = self.db.execute(
            sa.text(
                """
                SELECT id, action, target_type, target_id, detail_json, created_at
                FROM admin_audit_logs
                WHERE detail_json->>'trace_id' = :trace_id
                ORDER BY created_at ASC
                """
            ),
            {"trace_id": trace_id},
        ).mappings().all()
        return {
            "trace_id": trace_id,
            "model_calls": [
                {
                    "id": str(log.id),
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                    "provider": provider.provider if provider else "local",
                    "display_name": provider.display_name if provider else "Local fallback",
                    "model_name": log.model_name,
                    "capability": log.capability,
                    "status": log.status,
                    "latency_ms": log.latency_ms,
                    "token_input": log.token_input,
                    "token_output": log.token_output,
                    "estimated_cost": float((log.meta_json or {}).get("estimated_cost") or 0),
                    "error_message": log.error_message,
                    "course_slug": course.slug if course else None,
                    "course_title": course.title if course else None,
                    "meta_json": log.meta_json or {},
                }
                for log, provider, course in model_rows
            ],
            "rag_queries": [
                {
                    "id": str(row["id"]),
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                    "course_slug": row["course_slug"],
                    "course_title": row["course_title"],
                    "intent": row["intent"],
                    "hit": row["hit"],
                    "top_score": float(row["top_score"] or 0),
                    "citation_count": int(row["citation_count"] or 0),
                    "refused": row["refused"],
                    "latency_ms": int(row["latency_ms"] or 0),
                    "query_text": row["query_text"],
                    "meta_json": row["meta_json"] or {},
                }
                for row in rag_rows
            ],
            "admin_audits": [
                {
                    "id": str(row["id"]),
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                    "action": row["action"],
                    "target_type": row["target_type"],
                    "target_id": row["target_id"],
                    "detail_json": row["detail_json"] or {},
                }
                for row in audit_rows
            ],
        }

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
        """查询模型调用日志列表并返回兼容前端看板的摘要。"""
        limit = max(1, min(limit, 500))
        conditions, start_bound, end_bound = self._build_log_conditions(
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

        rows = self.db.execute(
            select(ModelCallLog, ModelProvider, Course)
            .outerjoin(ModelProvider, ModelProvider.id == ModelCallLog.provider_id)
            .outerjoin(Course, Course.id == ModelCallLog.course_id)
            .where(*conditions)
            .order_by(ModelCallLog.created_at.desc())
            .limit(limit)
        ).all()
        summary = self.db.execute(
            select(
                func.count(ModelCallLog.id),
                func.sum(sa.case((ModelCallLog.status != "success", 1), else_=0)),
                func.avg(ModelCallLog.latency_ms),
                func.sum(ModelCallLog.request_count),
                func.sum(ModelCallLog.token_input),
                func.sum(ModelCallLog.token_output),
                func.sum(sa.cast(ModelCallLog.meta_json["estimated_cost"].astext, sa.Float)),
            )
            .select_from(ModelCallLog)
            .outerjoin(ModelProvider, ModelProvider.id == ModelCallLog.provider_id)
            .outerjoin(Course, Course.id == ModelCallLog.course_id)
            .where(*conditions)
        ).one()
        total = int(summary[0] or 0)
        failed = int(summary[1] or 0)
        return {
            "range": {
                "start_at": start_bound.isoformat(),
                "end_at": end_bound.isoformat(),
            },
            "summary": {
                "total_calls": total,
                "failed_calls": failed,
                "failure_rate": round((failed / total * 100) if total else 0, 1),
                "avg_latency_ms": round(float(summary[2] or 0)),
                "request_count": int(summary[3] or 0),
                "token_input": int(summary[4] or 0),
                "token_output": int(summary[5] or 0),
                "estimated_cost": round(float(summary[6] or 0), 4),
            },
            "items": [
                {
                    "id": str(log.id),
                    "provider": provider.provider if provider else ("讯飞" if log.capability == "doc_qa" else "local"),
                    "display_name": provider.display_name if provider else ("讯飞文档问答" if log.capability == "doc_qa" else "Local fallback"),
                    "course_id": str(course.id) if course else None,
                    "course_slug": course.slug if course else None,
                    "course_title": course.title if course else None,
                    "model_name": log.model_name,
                    "capability": log.capability,
                    "request_count": log.request_count,
                    "batch_count": log.batch_count,
                    "embedding_dim": log.embedding_dim,
                    "token_input": log.token_input,
                    "token_output": log.token_output,
                    "latency_ms": log.latency_ms,
                    "status": log.status,
                    "error_message": log.error_message,
                    "meta_json": log.meta_json or {},
                    "trace_id": (log.meta_json or {}).get("trace_id"),
                    "estimated_cost": float((log.meta_json or {}).get("estimated_cost") or 0),
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                }
                for log, provider, course in rows
            ],
        }

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
        """按筛选条件删除模型调用日志，不负责审计和事务提交。"""
        conditions, start_bound, end_bound = self._build_log_conditions(
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
        deleted = int(
            self.db.execute(delete(ModelCallLog).where(ModelCallLog.id.in_(self._log_id_subquery(conditions)))).rowcount
            or 0
        )
        return ClearedCallLogs(deleted=deleted, start_bound=start_bound, end_bound=end_bound)

    def usage_stats(
        self,
        days: int = 30,
        start_at: str | None = None,
        end_at: str | None = None,
        capability: str = "all",
    ) -> dict[str, Any]:
        """为用量统计看板聚合各供应商的调用数据。"""
        conditions = []
        if capability and capability != "all":
            conditions.append(ModelCallLog.capability == capability)
        if start_at:
            try:
                conditions.append(ModelCallLog.created_at >= datetime.fromisoformat(start_at))
            except ValueError:
                logger.debug("忽略无法解析的模型用量统计开始时间 start_at=%s", start_at)
        if end_at:
            try:
                conditions.append(ModelCallLog.created_at <= datetime.fromisoformat(end_at))
            except ValueError:
                logger.debug("忽略无法解析的模型用量统计结束时间 end_at=%s", end_at)
        if not start_at and not end_at:
            cutoff = self._utcnow_naive() - timedelta(days=days)
            conditions.append(ModelCallLog.created_at >= cutoff)

        provider_rows = self.db.execute(
            select(
                ModelCallLog.provider_id,
                func.count(ModelCallLog.id).label("total_calls"),
                func.sum(sa.case((ModelCallLog.status != "success", 1), else_=0)).label("failed_calls"),
                func.avg(ModelCallLog.latency_ms).label("avg_latency_ms"),
                func.sum(ModelCallLog.token_input).label("token_input"),
                func.sum(ModelCallLog.token_output).label("token_output"),
                func.sum(ModelCallLog.request_count).label("request_count"),
                func.sum(sa.cast(ModelCallLog.meta_json["estimated_cost"].astext, sa.Float)).label("estimated_cost"),
            )
            .where(*conditions)
            .group_by(ModelCallLog.provider_id)
            .order_by(func.count(ModelCallLog.id).desc())
        ).all()

        trend_rows = self.db.execute(
            select(
                func.date(ModelCallLog.created_at).label("date"),
                func.count(ModelCallLog.id).label("calls"),
                func.sum(ModelCallLog.token_input).label("token_input"),
                func.sum(ModelCallLog.token_output).label("token_output"),
                func.sum(sa.cast(ModelCallLog.meta_json["estimated_cost"].astext, sa.Float)).label("estimated_cost"),
            )
            .where(*conditions)
            .group_by(func.date(ModelCallLog.created_at))
            .order_by(func.date(ModelCallLog.created_at))
        ).all()

        total = sum(int(r[1] or 0) for r in provider_rows)
        failed = sum(int(r[2] or 0) for r in provider_rows)
        total_tokens_in = sum(int(r[4] or 0) for r in provider_rows)
        total_tokens_out = sum(int(r[5] or 0) for r in provider_rows)
        total_cost = sum(float(r[7] or 0) for r in provider_rows)

        provider_details: dict[str | None, dict[str, Any]] = {}
        db_providers = self.db.execute(select(ModelProvider)).scalars().all()
        for db_provider in db_providers:
            provider_details[str(db_provider.id)] = {
                "provider": db_provider.provider,
                "display_name": db_provider.display_name,
            }

        items = []
        for row in provider_rows:
            pid = str(row[0]) if row[0] else None
            info = provider_details.get(pid, {})
            calls = int(row[1] or 0)
            fails = int(row[2] or 0)
            items.append(
                {
                    "provider": info.get("provider", "unknown"),
                    "display_name": info.get("display_name", "未知"),
                    "total_calls": calls,
                    "failed_calls": fails,
                    "failure_rate": round((fails / calls * 100) if calls else 0, 1),
                    "avg_latency_ms": round(float(row[3] or 0)),
                    "token_input": int(row[4] or 0),
                    "token_output": int(row[5] or 0),
                    "request_count": int(row[6] or 0),
                    "estimated_cost": round(float(row[7] or 0), 4),
                }
            )

        cost_trends = [
            {
                "date": str(row[0]),
                "calls": int(row[1] or 0),
                "token_input": int(row[2] or 0),
                "token_output": int(row[3] or 0),
                "estimated_cost": round(float(row[4] or 0), 4),
            }
            for row in trend_rows
        ]

        return {
            "summary": {
                "total_calls": total,
                "failed_calls": failed,
                "failure_rate": round((failed / total * 100) if total else 0, 1),
                "token_input": total_tokens_in,
                "token_output": total_tokens_out,
                "estimated_cost": total_cost,
            },
            "items": items,
            "cost_trends": cost_trends,
        }

    @staticmethod
    def _parse_log_datetime(value: str | None) -> datetime | None:
        """解析日志筛选时间，带时区输入会统一转换为 UTC naive datetime。"""
        if not value or not str(value).strip():
            return None
        raw = str(value).strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError:
            return None
        if parsed.tzinfo is not None:
            return parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed

    def _build_log_conditions(
        self,
        *,
        capability: str = "all",
        provider: str | None = None,
        status: str | None = None,
        course_id: str | None = None,
        days: int | None = 7,
        start_at: str | None = None,
        end_at: str | None = None,
        model_name: str | None = None,
        trace_id: str | None = None,
    ) -> tuple[list[Any], datetime, datetime]:
        end_bound = self._parse_log_datetime(end_at) or self._utcnow_naive()
        start_bound = self._parse_log_datetime(start_at)
        if start_bound is None:
            window_days = max(1, min(days or 7, 90))
            start_bound = end_bound - timedelta(days=window_days)
        if start_bound > end_bound:
            start_bound, end_bound = end_bound, start_bound
        max_span = timedelta(days=90)
        if end_bound - start_bound > max_span:
            start_bound = end_bound - max_span

        conditions: list[Any] = [
            ModelCallLog.created_at >= start_bound,
            ModelCallLog.created_at <= end_bound,
        ]
        if capability != "all":
            conditions.append(ModelCallLog.capability == capability)
        if provider:
            conditions.append(ModelProvider.provider == provider)
        if status:
            conditions.append(ModelCallLog.status == status)
        if course_id:
            conditions.append(
                or_(
                    Course.slug == course_id,
                    sa.cast(ModelCallLog.course_id, sa.String) == self._safe_uuid_text(course_id),
                )
            )
        if model_name and model_name.strip():
            conditions.append(ModelCallLog.model_name.ilike(f"%{model_name.strip()}%"))
        if trace_id and trace_id.strip():
            needle = trace_id.strip()
            conditions.append(ModelCallLog.meta_json["trace_id"].astext.ilike(f"%{needle}%"))
        return conditions, start_bound, end_bound

    @staticmethod
    def _log_id_subquery(conditions: list[Any]) -> Any:
        """构造删除日志前使用的 ID 子查询，保持筛选条件与列表查询一致。"""
        return (
            select(ModelCallLog.id)
            .select_from(ModelCallLog)
            .outerjoin(ModelProvider, ModelProvider.id == ModelCallLog.provider_id)
            .outerjoin(Course, Course.id == ModelCallLog.course_id)
            .where(*conditions)
        )

    @staticmethod
    def _safe_uuid_text(value: str) -> str:
        """将可能的 UUID 文本规范化，非法值返回永不命中的空 UUID。"""
        try:
            import uuid

            return str(uuid.UUID(str(value)))
        except (TypeError, ValueError):
            return "00000000-0000-0000-0000-000000000000"

    @staticmethod
    def _utcnow_naive() -> datetime:
        """返回当前 UTC naive datetime，兼容既有数据库时间字段。"""
        return datetime.now(timezone.utc).replace(tzinfo=None)

    @staticmethod
    def _model_name_for_capability(config: ModelGatewayCallConfig, capability: str) -> str | None:
        """按能力类型选择日志中展示的模型名称。"""
        if capability == "embedding":
            return config.embedding_model
        if capability in {"image", "image_generation"}:
            return config.image_model
        return config.chat_model
