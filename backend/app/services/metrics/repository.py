from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Course


class MetricsRepository:
    """汇总平台运行指标、运维看板数据和告警建议的仓储服务。"""

    def __init__(self, db: Session) -> None:
        """保存数据库会话，用于执行指标聚合查询。"""
        self.db = db

    @staticmethod
    def _non_demo_metric_sql(alias: str) -> str:
        """生成过滤演示指标种子数据的 SQL 条件片段。"""
        return f"COALESCE({alias}.meta_json->>'source', '') NOT IN ('ops_demo_seed', 'seed', 'latest_demo')"

    @staticmethod
    def _non_demo_rag_sql(alias: str) -> str:
        """生成过滤演示 RAG 查询日志的 SQL 条件片段。"""
        return f"COALESCE({alias}.meta_json->>'demo', 'false') != 'true' AND COALESCE({alias}.meta_json->>'source', '') != 'ops_demo_seed'"

    @staticmethod
    def _non_demo_safety_sql(alias: str) -> str:
        """生成过滤演示安全事件的 SQL 条件片段。"""
        return f"COALESCE({alias}.meta_json->>'source', '') != 'ops_demo_seed'"

    @staticmethod
    def _non_demo_model_call_sql(alias: str) -> str:
        """生成过滤历史演示模型调用日志的 SQL 条件片段。"""
        return f"""
        NOT (
            COALESCE({alias}.meta_json, '{{}}'::jsonb) = '{{}}'::jsonb
            AND {alias}.created_at >= TIMESTAMPTZ '2026-05-24T00:00:00Z'
            AND {alias}.created_at < TIMESTAMPTZ '2026-05-26T00:00:00Z'
            AND COALESCE({alias}.agent_name, '') IN ('课程检索 Agent', '资源生成 Agent', '引用核验 Agent', '文档伴读 Agent')
        )
        """

    def latest_metrics(self) -> dict[str, Any]:
        """读取最近一天的真实运行指标快照。

        返回:
            标准化后的日活、访问、RAG、资源生成、模型失败率和队列指标；无数据时返回零值结构。
        """
        row = self.db.execute(
            sa.text(
                f"""
                SELECT metric_date, dau, course_visits, path_nodes_completed, rag_hit_rate,
                       citation_coverage, resource_success_rate, p95_latency, model_failure_rate,
                       queue_backlog, safety_blocks
                FROM usage_metrics_daily um
                WHERE {self._non_demo_metric_sql("um")}
                ORDER BY metric_date DESC
                LIMIT 1
                """
            )
        ).mappings().first()
        if not row:
            return {
                "dau": 0,
                "course_visits": 0,
                "path_nodes_completed": 0,
                "rag_hit_rate": 0,
                "citation_coverage": 0,
                "resource_success_rate": 0,
                "p95_latency": 0,
                "model_failure_rate": 0,
                "queue_backlog": 0,
                "safety_blocks": 0,
                "metric_date": None,
            }
        return {
            "dau": int(row["dau"] or 0),
            "course_visits": int(row["course_visits"] or 0),
            "path_nodes_completed": int(row["path_nodes_completed"] or 0),
            "rag_hit_rate": round(self._percent_value(row["rag_hit_rate"]), 1),
            "citation_coverage": round(self._percent_value(row["citation_coverage"]), 1),
            "resource_success_rate": round(self._percent_value(row["resource_success_rate"]), 1),
            "p95_latency": round(row["p95_latency"] or 0, 1),
            "model_failure_rate": round(self._percent_value(row["model_failure_rate"]), 1),
            "queue_backlog": int(row["queue_backlog"] or 0),
            "safety_blocks": int(row["safety_blocks"] or 0),
            "metric_date": row["metric_date"].isoformat() if row["metric_date"] else None,
        }

    def operations_dashboard(self, course_id: str | None = None, days: int = 7) -> dict[str, Any]:
        """聚合运维监控页所需的课程级或全局指标。

        参数:
            course_id: 课程 slug 或 UUID，为空时汇总全局数据。
            days: 查询窗口天数，会被限制在 1 到 30 天之间。

        返回:
            包含概览、趋势、模型调用、RAG、队列、云端知识库、AI 对话和告警的数据结构。
        """
        days = max(1, min(days, 30))
        course_uuid = self._resolve_course_uuid(course_id)
        since_date = date.today() - timedelta(days=days - 1)
        since_dt = datetime.combine(since_date, datetime.min.time())
        trends = self._trend(course_uuid, since_date)
        model_calls = self._model_calls(course_uuid, since_dt)
        embedding_report = self._embedding_report(course_uuid, since_dt)
        rag_report = self._rag_report(course_uuid, since_dt)
        queues = self._queue_status(course_uuid, course_key=course_id if course_uuid else None)
        cloud_ingestion = self._cloud_ingestion_report(course_uuid)
        overview = self._live_overview(course_uuid, since_dt, model_calls, rag_report, queues, cloud_ingestion)
        recent_events = self._recent_events(course_uuid, since_dt)
        cost_trends = self._cost_trends(course_uuid, since_date)
        ai_dialogue = self._ai_dialogue_report(course_uuid, since_dt)
        resource_failures = self._resource_failure_report(course_uuid, since_dt)
        cloud_ops = self._cloud_ops_report(
            course_id,
            course_uuid,
            since_dt,
            model_calls=model_calls,
            rag_report=rag_report,
            cloud_ingestion=cloud_ingestion,
            queues=queues,
        )
        alerts = self._alerts(
            overview,
            model_calls,
            rag_report,
            queues,
            ai_dialogue,
            resource_failures,
            cloud_ops=cloud_ops,
        )
        return {
            "course_id": course_id,
            "days": days,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "overview": overview,
            "trends": trends,
            "model_calls": model_calls,
            "embedding_report": embedding_report,
            "rag_report": rag_report,
            "queues": queues,
            "cloud_ingestion": cloud_ingestion,
            "chatdoc_ingestion": cloud_ingestion,
            "cost_trends": cost_trends,
            "cloud_ops": cloud_ops,
            "ai_dialogue": ai_dialogue,
            "resource_failures": resource_failures,
            "recent_events": recent_events,
            "alerts": alerts,
        }

    @staticmethod
    def _percent_value(value: float | int | None) -> float:
        """把 0 到 1 的比例值统一转换为百分比数值。"""
        value = float(value or 0)
        return value * 100 if 0 < value <= 1 else value

    @staticmethod
    def _course_scope_params(course_uuid: str | None, course_key: str | None = None) -> dict[str, Any]:
        """生成课程过滤 SQL 共用的参数集合。"""
        return {
            "course_id": course_uuid or "00000000-0000-0000-0000-000000000000",
            "course_key": course_key or "",
            "all_courses": course_uuid is None,
        }

    def _resolve_course_uuid(self, course_key: str | None) -> str | None:
        """把课程 slug 或 UUID 字符串解析为数据库中的课程 UUID。"""
        if not course_key:
            return None
        course = self.db.execute(select(Course).where(Course.slug == course_key)).scalar_one_or_none()
        if course:
            return str(course.id)
        try:
            course_uuid = uuid.UUID(str(course_key))
        except (TypeError, ValueError):
            return None
        course = self.db.get(Course, course_uuid)
        return str(course.id) if course else None

    def _latest_metrics_for_course(self, course_id: str | None) -> dict[str, Any] | None:
        """查询单个课程最近一天的真实运行指标快照。"""
        if not course_id:
            return None
        row = self.db.execute(
            sa.text(
                f"""
                SELECT metric_date, dau, course_visits, path_nodes_completed, rag_hit_rate,
                       citation_coverage, resource_success_rate, p95_latency, model_failure_rate,
                       queue_backlog, safety_blocks
                FROM usage_metrics_daily um
                WHERE um.course_id = CAST(:course_id AS UUID)
                  AND {self._non_demo_metric_sql("um")}
                ORDER BY metric_date DESC
                LIMIT 1
                """
            ),
            {"course_id": course_id},
        ).mappings().first()
        if not row:
            return None
        return {
            "metric_date": row["metric_date"].isoformat() if row["metric_date"] else None,
            "dau": row["dau"] or 0,
            "course_visits": row["course_visits"] or 0,
            "path_nodes_completed": row["path_nodes_completed"] or 0,
            "rag_hit_rate": round(self._percent_value(row["rag_hit_rate"]), 1),
            "citation_coverage": round(self._percent_value(row["citation_coverage"]), 1),
            "resource_success_rate": round(self._percent_value(row["resource_success_rate"]), 1),
            "p95_latency": round(row["p95_latency"] or 0, 1),
            "model_failure_rate": round(self._percent_value(row["model_failure_rate"]), 1),
            "queue_backlog": row["queue_backlog"] or 0,
            "safety_blocks": row["safety_blocks"] or 0,
        }

    def _live_overview(
        self,
        course_id: str | None,
        since_dt: datetime,
        model_calls: dict[str, Any],
        rag_report: dict[str, Any],
        queues: dict[str, Any],
        cloud_ingestion: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """基于实时日志汇总运维看板顶部概览指标。"""
        active_users = self.db.execute(
            sa.text(
                f"""
                SELECT COUNT(DISTINCT user_id) AS dau
                FROM (
                    SELECT m.user_id
                    FROM model_call_logs m
                    WHERE m.created_at >= :since_dt
                      AND m.user_id IS NOT NULL
                      AND (:all_courses = true OR m.course_id = CAST(:course_id AS UUID))
                      AND {self._non_demo_model_call_sql("m")}
                    UNION ALL
                    SELECT r.user_id
                    FROM rag_query_logs r
                    WHERE r.created_at >= :since_dt
                      AND r.user_id IS NOT NULL
                      AND (:all_courses = true OR r.course_id = CAST(:course_id AS UUID))
                      AND {self._non_demo_rag_sql("r")}
                    UNION ALL
                    SELECT le.user_id
                    FROM learning_events le
                    WHERE le.created_at >= :since_dt
                      AND le.user_id IS NOT NULL
                      AND (:all_courses = true OR le.course_id = CAST(:course_id AS UUID))
                    UNION ALL
                    SELECT t.requested_by_user_id AS user_id
                    FROM resource_generation_tasks t
                    WHERE t.created_at >= :since_dt
                      AND t.requested_by_user_id IS NOT NULL
                      AND (:all_courses = true OR t.course_id = CAST(:course_id AS UUID))
                ) live_users
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).scalar_one()
        activity_count = self.db.execute(
            sa.text(
                f"""
                SELECT COUNT(*) AS count
                FROM (
                    SELECT m.id
                    FROM model_call_logs m
                    WHERE m.created_at >= :since_dt
                      AND (:all_courses = true OR m.course_id = CAST(:course_id AS UUID))
                      AND {self._non_demo_model_call_sql("m")}
                    UNION ALL
                    SELECT r.id
                    FROM rag_query_logs r
                    WHERE r.created_at >= :since_dt
                      AND (:all_courses = true OR r.course_id = CAST(:course_id AS UUID))
                      AND {self._non_demo_rag_sql("r")}
                    UNION ALL
                    SELECT le.id
                    FROM learning_events le
                    WHERE le.created_at >= :since_dt
                      AND (:all_courses = true OR le.course_id = CAST(:course_id AS UUID))
                    UNION ALL
                    SELECT t.id
                    FROM resource_generation_tasks t
                    WHERE t.created_at >= :since_dt
                      AND (:all_courses = true OR t.course_id = CAST(:course_id AS UUID))
                ) live_activity
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).scalar_one()
        path_nodes_completed = self.db.execute(
            sa.text(
                """
                SELECT COUNT(*) AS count
                FROM learning_events
                WHERE created_at >= :since_dt
                  AND event_type = 'path_node_status_updated'
                  AND COALESCE(evidence_json->>'new_status', '') = 'mastered'
                  AND (:all_courses = true OR course_id = CAST(:course_id AS UUID))
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).scalar_one()
        resource_row = self.db.execute(
            sa.text(
                """
                SELECT COUNT(*) AS total,
                       SUM(CASE WHEN status IN ('succeeded', 'completed') THEN 1 ELSE 0 END) AS success
                FROM resource_generation_tasks
                WHERE created_at >= :since_dt
                  AND (:all_courses = true OR course_id = CAST(:course_id AS UUID))
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).mappings().first()
        safety_blocks = self.db.execute(
            sa.text(
                f"""
                SELECT COUNT(*) AS count
                FROM safety_events s
                WHERE s.created_at >= :since_dt
                  AND (:all_courses = true OR s.course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_safety_sql("s")}
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).scalar_one()
        resource_total = int(resource_row["total"] or 0) if resource_row else 0
        resource_success = int(resource_row["success"] or 0) if resource_row else 0
        p95_seconds = round(float(model_calls.get("p95_latency_ms") or 0) / 1000, 1)
        cloud = cloud_ingestion or {}
        has_runtime_data = any([
            int(active_users or 0),
            int(activity_count or 0),
            int(path_nodes_completed or 0),
            int(resource_total or 0),
            int(safety_blocks or 0),
            int(queues.get("resource_backlog") or queues.get("backlog") or 0),
            int(cloud.get("total_docs") or 0),
            int(model_calls.get("total_calls") or 0),
            int(rag_report.get("total_queries") or 0),
        ])
        return {
            "dau": int(active_users or 0),
            "course_visits": int(activity_count or 0),
            "path_nodes_completed": int(path_nodes_completed or 0),
            "rag_hit_rate": rag_report.get("hit_rate", 0),
            "citation_coverage": rag_report.get("citation_coverage", 0),
            "resource_success_rate": round((resource_success / resource_total * 100) if resource_total else 0, 1),
            "p95_latency": p95_seconds,
            "model_failure_rate": model_calls.get("failure_rate", 0),
            "queue_backlog": int(queues.get("resource_backlog") or queues.get("backlog") or 0),
            "cloud_stuck_docs": int(cloud.get("stuck_docs") or 0),
            "token_output_today": int(model_calls.get("token_input", 0) or 0) + int(model_calls.get("token_output", 0) or 0),
            "estimated_cost_today": float(model_calls.get("estimated_cost") or 0),
            "safety_blocks": int(safety_blocks or 0),
            "has_runtime_data": has_runtime_data,
        }

    def _trend(self, course_id: str | None, since_date: date) -> list[dict[str, Any]]:
        """按日期聚合日级运行趋势。"""
        rows = self.db.execute(
            sa.text(
                f"""
                SELECT metric_date, SUM(dau) AS dau, SUM(course_visits) AS course_visits,
                       SUM(path_nodes_completed) AS path_nodes_completed,
                       AVG(rag_hit_rate) AS rag_hit_rate,
                       AVG(citation_coverage) AS citation_coverage,
                       AVG(resource_success_rate) AS resource_success_rate,
                       AVG(p95_latency) AS p95_latency,
                       AVG(model_failure_rate) AS model_failure_rate,
                       SUM(queue_backlog) AS queue_backlog,
                       SUM(safety_blocks) AS safety_blocks
                FROM usage_metrics_daily
                WHERE metric_date >= :since_date
                  AND (:all_courses = true OR course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_metric_sql("usage_metrics_daily")}
                GROUP BY metric_date
                ORDER BY metric_date ASC
                """
            ),
            {"since_date": since_date, **self._course_scope_params(course_id)},
        ).mappings().all()
        return [
            {
                "date": row["metric_date"].isoformat(),
                "dau": int(row["dau"] or 0),
                "course_visits": int(row["course_visits"] or 0),
                "path_nodes_completed": int(row["path_nodes_completed"] or 0),
                "rag_hit_rate": round(self._percent_value(row["rag_hit_rate"]), 1),
                "citation_coverage": round(self._percent_value(row["citation_coverage"]), 1),
                "resource_success_rate": round(self._percent_value(row["resource_success_rate"]), 1),
                "p95_latency": round(row["p95_latency"] or 0, 1),
                "model_failure_rate": round(self._percent_value(row["model_failure_rate"]), 1),
                "queue_backlog": int(row["queue_backlog"] or 0),
                "safety_blocks": int(row["safety_blocks"] or 0),
            }
            for row in rows
        ]

    def _model_calls(self, course_id: str | None, since_dt: datetime) -> dict[str, Any]:
        """汇总模型调用量、失败率、延迟、Token 和费用。"""
        rows = self.db.execute(
            sa.text(
                f"""
                SELECT COALESCE(mp.provider, 'fallback') AS provider,
                       COALESCE(mp.display_name, '本地降级模型') AS display_name,
                       COALESCE(m.model_name, 'local-fallback') AS model_name,
                       COUNT(*) AS calls,
                       SUM(CASE WHEN m.status = 'success' THEN 1 ELSE 0 END) AS success_calls,
                       SUM(CASE WHEN m.status != 'success' THEN 1 ELSE 0 END) AS failed_calls,
                       AVG(m.latency_ms) AS avg_latency_ms,
                       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY m.latency_ms) AS p95_latency_ms,
                       SUM(m.token_input) AS token_input,
                       SUM(m.token_output) AS token_output,
                       SUM(COALESCE((m.meta_json->>'estimated_cost')::numeric, 0)) AS estimated_cost
                FROM model_call_logs m
                LEFT JOIN model_providers mp ON mp.id = m.provider_id
                WHERE m.created_at >= :since_dt
                  AND (:all_courses = true OR m.course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_model_call_sql("m")}
                GROUP BY provider, display_name, model_name
                ORDER BY calls DESC
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).mappings().all()
        by_agent_rows = self.db.execute(
            sa.text(
                f"""
                SELECT COALESCE(m.agent_name, 'unknown') AS agent_name,
                       COUNT(*) AS calls,
                       AVG(m.latency_ms) AS avg_latency_ms,
                       SUM(CASE WHEN m.status != 'success' THEN 1 ELSE 0 END) AS failed_calls
                FROM model_call_logs m
                WHERE m.created_at >= :since_dt
                  AND (:all_courses = true OR m.course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_model_call_sql("m")}
                GROUP BY agent_name
                ORDER BY calls DESC
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).mappings().all()
        p95_latency = self.db.execute(
            sa.text(
                f"""
                SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY m.latency_ms) AS p95_latency_ms
                FROM model_call_logs m
                WHERE m.created_at >= :since_dt
                  AND (:all_courses = true OR m.course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_model_call_sql("m")}
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).scalar_one_or_none()
        items = []
        total_calls = 0
        total_failed = 0
        total_input = 0
        total_output = 0
        total_cost = 0.0
        weighted_latency = 0.0
        for row in rows:
            calls = int(row["calls"] or 0)
            failed = int(row["failed_calls"] or 0)
            avg_latency = float(row["avg_latency_ms"] or 0)
            total_calls += calls
            total_failed += failed
            total_input += int(row["token_input"] or 0)
            total_output += int(row["token_output"] or 0)
            total_cost += float(row["estimated_cost"] or 0)
            weighted_latency += avg_latency * calls
            items.append(
                {
                    "provider": row["provider"],
                    "display_name": row["display_name"],
                    "model_name": row["model_name"],
                    "calls": calls,
                    "success_calls": int(row["success_calls"] or 0),
                    "failed_calls": failed,
                    "failure_rate": round((failed / calls * 100) if calls else 0, 1),
                    "avg_latency_ms": round(avg_latency),
                    "p95_latency_ms": round(float(row["p95_latency_ms"] or 0)),
                    "token_input": int(row["token_input"] or 0),
                    "token_output": int(row["token_output"] or 0),
                    "estimated_cost": round(float(row["estimated_cost"] or 0), 4),
                }
            )
        by_agent = [
            {
                "agent_name": row["agent_name"],
                "calls": int(row["calls"] or 0),
                "failed_calls": int(row["failed_calls"] or 0),
                "avg_latency_ms": round(float(row["avg_latency_ms"] or 0)),
            }
            for row in by_agent_rows
        ]
        return {
            "total_calls": total_calls,
            "failed_calls": total_failed,
            "failure_rate": round((total_failed / total_calls * 100) if total_calls else 0, 1),
            "avg_latency_ms": round(weighted_latency / total_calls) if total_calls else 0,
            "p95_latency_ms": round(float(p95_latency or 0)),
            "token_input": total_input,
            "token_output": total_output,
            "estimated_cost": round(total_cost, 4),
            "items": items,
            "by_agent": by_agent,
        }

    def _cost_trends(self, course_id: str | None, since_date: date) -> list[dict[str, Any]]:
        """按天补齐并汇总模型调用费用和 Token 消耗趋势。"""
        rows = self.db.execute(
            sa.text(
                f"""
                SELECT m.created_at::date AS day,
                       SUM(COALESCE((m.meta_json->>'estimated_cost')::numeric, 0)) AS estimated_cost,
                       SUM(m.token_input) AS token_input,
                       SUM(m.token_output) AS token_output,
                       COUNT(*) AS calls
                FROM model_call_logs m
                WHERE m.created_at::date >= :since_date
                  AND (:all_courses = true OR m.course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_model_call_sql("m")}
                GROUP BY day
                ORDER BY day ASC
                """
            ),
            {"since_date": since_date, **self._course_scope_params(course_id)},
        ).mappings().all()
        by_day = {row["day"]: row for row in rows}
        today = date.today()
        days: list[dict[str, Any]] = []
        current = since_date
        while current <= today:
            row = by_day.get(current)
            days.append(
                {
                    "date": current.isoformat(),
                    "estimated_cost": round(float(row["estimated_cost"] or 0), 4) if row else 0,
                    "token_input": int(row["token_input"] or 0) if row else 0,
                    "token_output": int(row["token_output"] or 0) if row else 0,
                    "calls": int(row["calls"] or 0) if row else 0,
                }
            )
            current += timedelta(days=1)
        return days

    def _embedding_report(self, course_id: str | None, since_dt: datetime) -> dict[str, Any]:
        """汇总向量模型调用健康度和主要错误。"""
        rows = self.db.execute(
            sa.text(
                f"""
                SELECT COALESCE(mp.provider, 'local') AS provider,
                       COALESCE(mp.display_name, 'Local hash embedding') AS display_name,
                       COALESCE(m.model_name, 'local-hash-embedding-v1') AS model_name,
                       COUNT(*) AS calls,
                       SUM(CASE WHEN m.status = 'success' THEN 1 ELSE 0 END) AS success_calls,
                       SUM(CASE WHEN m.status != 'success' THEN 1 ELSE 0 END) AS failed_calls,
                       SUM(m.request_count) AS request_count,
                       SUM(m.batch_count) AS batch_count,
                       AVG(m.latency_ms) AS avg_latency_ms,
                       AVG(m.embedding_dim) AS avg_embedding_dim
                FROM model_call_logs m
                LEFT JOIN model_providers mp ON mp.id = m.provider_id
                WHERE m.created_at >= :since_dt
                  AND m.capability = 'embedding'
                  AND (:all_courses = true OR m.course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_model_call_sql("m")}
                GROUP BY provider, display_name, model_name
                ORDER BY calls DESC
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).mappings().all()
        error_rows = self.db.execute(
            sa.text(
                f"""
                SELECT COALESCE(NULLIF(error_message, ''), 'unknown') AS error_message, COUNT(*) AS count
                FROM model_call_logs
                WHERE created_at >= :since_dt
                  AND capability = 'embedding'
                  AND status != 'success'
                  AND (:all_courses = true OR course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_model_call_sql("model_call_logs")}
                GROUP BY error_message
                ORDER BY count DESC
                LIMIT 5
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).mappings().all()
        items = []
        total_calls = 0
        failed_calls = 0
        request_count = 0
        weighted_latency = 0.0
        for row in rows:
            calls = int(row["calls"] or 0)
            failed = int(row["failed_calls"] or 0)
            avg_latency = float(row["avg_latency_ms"] or 0)
            total_calls += calls
            failed_calls += failed
            request_count += int(row["request_count"] or 0)
            weighted_latency += avg_latency * calls
            items.append(
                {
                    "provider": row["provider"],
                    "display_name": row["display_name"],
                    "model_name": row["model_name"],
                    "calls": calls,
                    "success_calls": int(row["success_calls"] or 0),
                    "failed_calls": failed,
                    "request_count": int(row["request_count"] or 0),
                    "batch_count": int(row["batch_count"] or 0),
                    "failure_rate": round((failed / calls * 100) if calls else 0, 1),
                    "avg_latency_ms": round(avg_latency),
                    "avg_embedding_dim": round(float(row["avg_embedding_dim"] or 0)),
                }
            )
        return {
            "total_calls": total_calls,
            "failed_calls": failed_calls,
            "success_rate": round(((total_calls - failed_calls) / total_calls * 100) if total_calls else 0, 1),
            "failure_rate": round((failed_calls / total_calls * 100) if total_calls else 0, 1),
            "avg_latency_ms": round(weighted_latency / total_calls) if total_calls else 0,
            "request_count": request_count,
            "items": items,
            "top_errors": [{"error_message": row["error_message"], "count": int(row["count"] or 0)} for row in error_rows],
        }

    def _rag_report(self, course_id: str | None, since_dt: datetime) -> dict[str, Any]:
        """汇总 RAG 查询命中率、引用覆盖和低置信样本。"""
        summary = self.db.execute(
            sa.text(
                f"""
                SELECT COUNT(*) AS total_queries,
                       SUM(CASE WHEN hit THEN 1 ELSE 0 END) AS hit_queries,
                       AVG(top_score) AS avg_top_score,
                       SUM(CASE WHEN citation_count > 0 THEN 1 ELSE 0 END) AS cited_queries,
                       SUM(CASE WHEN refused THEN 1 ELSE 0 END) AS refused_queries,
                       SUM(CASE WHEN top_score < 0.65 OR citation_count = 0 THEN 1 ELSE 0 END) AS low_confidence_queries,
                       AVG(latency_ms) AS avg_latency_ms
                FROM rag_query_logs
                WHERE created_at >= :since_dt
                  AND (:all_courses = true OR course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_rag_sql("rag_query_logs")}
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).mappings().first()
        by_intent_rows = self.db.execute(
            sa.text(
                f"""
                SELECT intent, COUNT(*) AS total_queries,
                       AVG(CASE WHEN hit THEN 1 ELSE 0 END) * 100 AS hit_rate,
                       AVG(CASE WHEN citation_count > 0 THEN 1 ELSE 0 END) * 100 AS citation_coverage,
                       AVG(top_score) AS avg_top_score
                FROM rag_query_logs
                WHERE created_at >= :since_dt
                  AND (:all_courses = true OR course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_rag_sql("rag_query_logs")}
                GROUP BY intent
                ORDER BY total_queries DESC
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).mappings().all()
        low_rows = self.db.execute(
            sa.text(
                f"""
                SELECT query_text, intent, top_score, citation_count, refused, latency_ms
                FROM rag_query_logs
                WHERE created_at >= :since_dt
                  AND (:all_courses = true OR course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_rag_sql("rag_query_logs")}
                  AND (top_score < 0.65 OR citation_count = 0 OR refused = true)
                ORDER BY created_at DESC
                LIMIT 8
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).mappings().all()
        total = int(summary["total_queries"] or 0) if summary else 0
        hit = int(summary["hit_queries"] or 0) if summary else 0
        cited = int(summary["cited_queries"] or 0) if summary else 0
        return {
            "total_queries": total,
            "hit_queries": hit,
            "hit_rate": round((hit / total * 100) if total else 0, 1),
            "avg_top_score": round(float(summary["avg_top_score"] or 0), 2) if summary else 0,
            "citation_coverage": round((cited / total * 100) if total else 0, 1),
            "refused_queries": int(summary["refused_queries"] or 0) if summary else 0,
            "low_confidence_queries": int(summary["low_confidence_queries"] or 0) if summary else 0,
            "avg_latency_ms": round(float(summary["avg_latency_ms"] or 0)) if summary else 0,
            "by_intent": [
                {
                    "intent": row["intent"],
                    "total_queries": int(row["total_queries"] or 0),
                    "hit_rate": round(float(row["hit_rate"] or 0), 1),
                    "citation_coverage": round(float(row["citation_coverage"] or 0), 1),
                    "avg_top_score": round(float(row["avg_top_score"] or 0), 2),
                }
                for row in by_intent_rows
            ],
            "low_confidence_samples": [
                {
                    "query_text": row["query_text"],
                    "intent": row["intent"],
                    "top_score": round(float(row["top_score"] or 0), 2),
                    "citation_count": int(row["citation_count"] or 0),
                    "refused": bool(row["refused"]),
                    "latency_ms": int(row["latency_ms"] or 0),
                }
                for row in low_rows
            ],
        }

    def _queue_status(self, course_id: str | None, course_key: str | None = None) -> dict[str, Any]:
        """统计资源生成、文档解析、向量化和检索校验队列状态。"""
        resource_rows = self.db.execute(
            sa.text(
                """
                SELECT status, COUNT(*) AS count
                FROM resource_generation_tasks
                WHERE (:all_courses = true OR course_id = CAST(:course_id AS UUID))
                GROUP BY status
                ORDER BY count DESC
                """
            ),
            self._course_scope_params(course_id, course_key),
        ).mappings().all()
        document_rows = self.db.execute(
            sa.text(
                """
                SELECT t.status, COUNT(*) AS count
                FROM document_parse_tasks t
                JOIN documents d ON d.id = t.document_id
                WHERE (:all_courses = true OR d.course_id = CAST(:course_id AS UUID))
                GROUP BY t.status
                ORDER BY count DESC
                """
            ),
            self._course_scope_params(course_id, course_key),
        ).mappings().all()
        vector_rows = self.db.execute(
            sa.text(
                """
                SELECT t.status, COUNT(*) AS count
                FROM vectorization_tasks t
                LEFT JOIN documents d ON d.id = t.document_id
                WHERE (
                    :all_courses = true
                    OR d.course_id = CAST(:course_id AS UUID)
                    OR t.scope_id = :course_id_str
                    OR (:course_key <> '' AND t.scope_id = :course_key)
                )
                GROUP BY t.status
                ORDER BY count DESC
                """
            ),
            {
                **self._course_scope_params(course_id, course_key),
                "course_id_str": str(course_id or "00000000-0000-0000-0000-000000000000"),
            },
        ).mappings().all()
        retrieval_rows = self.db.execute(
            sa.text(
                """
                SELECT status, COUNT(*) AS count
                FROM retrieval_verification_runs
                WHERE (:all_courses = true OR course_id = CAST(:course_id AS UUID))
                GROUP BY status
                ORDER BY count DESC
                """
            ),
            self._course_scope_params(course_id, course_key),
        ).mappings().all()
        resource = [{"status": row["status"], "count": int(row["count"] or 0)} for row in resource_rows]
        document = [{"status": row["status"], "count": int(row["count"] or 0)} for row in document_rows]
        vectorization = [{"status": row["status"], "count": int(row["count"] or 0)} for row in vector_rows]
        retrieval = [{"status": row["status"], "count": int(row["count"] or 0)} for row in retrieval_rows]
        active_resource_statuses = {"queued", "running", "planning", "retrieving", "generating", "verifying", "safety_checking", "pending"}
        resource_backlog = sum(item["count"] for item in resource if item["status"] in active_resource_statuses)
        legacy_backlog = sum(
            item["count"]
            for item in document + vectorization + retrieval
            if item["status"] in {"queued", "running", "pending"}
        )
        return {
            "backlog": resource_backlog,
            "resource_backlog": resource_backlog,
            "legacy_local_backlog": legacy_backlog,
            "resource_generation": resource,
            "document_parse": document,
            "vectorization": vectorization,
            "retrieval_verification": retrieval,
        }

    def _cloud_ingestion_report(self, course_id: str | None) -> dict[str, Any]:
        """汇总云端知识库文档摄取进度、卡住数量和失败样本。"""
        summary = self.db.execute(
            sa.text(
                """
                SELECT COUNT(*) AS total_docs,
                       SUM(CASE WHEN d.vector_status IN ('ready', 'indexed') THEN 1 ELSE 0 END) AS ready_docs,
                       SUM(CASE WHEN d.vector_status = 'failed' OR d.parse_status = 'failed' THEN 1 ELSE 0 END) AS failed_docs,
                       SUM(
                           CASE
                               WHEN d.vector_status IN ('processing', 'pending', 'pending_review', 'indexing', 'vectorizing')
                                    OR d.parse_status = 'processing'
                               THEN 1 ELSE 0
                           END
                       ) AS processing_docs,
                       COALESCE(SUM(NULLIF((d.meta_json->>'chatdoc_chunk_total')::int, 0)), 0) AS chunk_total,
                       AVG(NULLIF((d.meta_json->>'ingestion_duration_ms')::float, 0)) AS avg_ingestion_ms
                FROM documents d
                WHERE d.deleted_at IS NULL
                  AND d.parse_status <> 'deleted'
                  AND COALESCE(d.meta_json->>'rag_backend', 'cloud_kb') IN ('iflytek_chatdoc', 'cloud_kb')
                  AND (:all_courses = true OR d.course_id = CAST(:course_id AS UUID))
                """
            ),
            self._course_scope_params(course_id),
        ).mappings().first() or {}
        stuck_docs = self.db.execute(
            sa.text(
                """
                SELECT COUNT(*) AS count
                FROM documents d
                WHERE d.deleted_at IS NULL
                  AND d.parse_status <> 'deleted'
                  AND COALESCE(d.meta_json->>'rag_backend', 'cloud_kb') IN ('iflytek_chatdoc', 'cloud_kb')
                  AND (
                      d.vector_status IN ('processing', 'pending', 'pending_review', 'indexing', 'vectorizing')
                      OR d.parse_status = 'processing'
                  )
                  AND d.updated_at < NOW() - INTERVAL '2 hours'
                  AND (:all_courses = true OR d.course_id = CAST(:course_id AS UUID))
                """
            ),
            self._course_scope_params(course_id),
        ).scalar_one()
        status_rows = self.db.execute(
            sa.text(
                """
                SELECT COALESCE(NULLIF(d.meta_json->>'cloud_status', ''), NULLIF(d.meta_json->>'chatdoc_file_status', ''), 'unknown') AS file_status,
                       COUNT(*) AS count
                FROM documents d
                WHERE d.deleted_at IS NULL
                  AND d.parse_status <> 'deleted'
                  AND COALESCE(d.meta_json->>'rag_backend', 'cloud_kb') IN ('iflytek_chatdoc', 'cloud_kb')
                  AND (:all_courses = true OR d.course_id = CAST(:course_id AS UUID))
                GROUP BY 1
                ORDER BY count DESC
                """
            ),
            self._course_scope_params(course_id),
        ).mappings().all()
        failure_samples = self.db.execute(
            sa.text(
                """
                SELECT d.title,
                       COALESCE(d.meta_json->>'chatdoc_error', d.meta_json->>'cloud_status', 'unknown') AS error_hint,
                       d.updated_at
                FROM documents d
                WHERE d.deleted_at IS NULL
                  AND (d.vector_status = 'failed' OR d.parse_status = 'failed')
                  AND COALESCE(d.meta_json->>'rag_backend', 'cloud_kb') IN ('iflytek_chatdoc', 'cloud_kb')
                  AND (:all_courses = true OR d.course_id = CAST(:course_id AS UUID))
                ORDER BY d.updated_at DESC
                LIMIT 6
                """
            ),
            self._course_scope_params(course_id),
        ).mappings().all()
        total_docs = int(summary.get("total_docs") or 0)
        ready_docs = int(summary.get("ready_docs") or 0)
        failed_docs = int(summary.get("failed_docs") or 0)
        terminal = ready_docs + failed_docs
        success_rate = round((ready_docs / terminal) * 100, 1) if terminal else 0.0
        return {
            "total_docs": total_docs,
            "ready_docs": ready_docs,
            "failed_docs": failed_docs,
            "processing_docs": int(summary.get("processing_docs") or 0),
            "stuck_docs": int(stuck_docs or 0),
            "chunk_total": int(summary.get("chunk_total") or 0),
            "success_rate": success_rate,
            "avg_ingestion_ms": int(summary.get("avg_ingestion_ms") or 0),
            "status_distribution": [
                {"file_status": row["file_status"], "count": int(row["count"] or 0)}
                for row in status_rows
            ],
            "recent_failures": [
                {
                    "title": row["title"],
                    "error_hint": row["error_hint"],
                    "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
                }
                for row in failure_samples
            ],
        }

    def _cloud_ops_report(
        self,
        course_slug: str | None,
        course_uuid: str | None,
        since_dt: datetime,
        *,
        model_calls: dict[str, Any],
        rag_report: dict[str, Any],
        cloud_ingestion: dict[str, Any],
        queues: dict[str, Any],
    ) -> dict[str, Any]:
        """汇总云端链路健康、额度使用和关键延迟指标。"""
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        tokens_today = self.db.execute(
            sa.text(
                f"""
                SELECT COALESCE(SUM(m.token_input + m.token_output), 0) AS tokens
                FROM model_call_logs m
                WHERE m.created_at >= :today_start
                  AND (:all_courses = true OR m.course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_model_call_sql("m")}
                """
            ),
            {"today_start": today_start, **self._course_scope_params(course_uuid)},
        ).scalar_one()
        sync_rows = self.db.execute(
            sa.text(
                """
                SELECT COALESCE(d.meta_json->>'last_status_source', 'unknown') AS source, COUNT(*) AS count
                FROM documents d
                WHERE d.deleted_at IS NULL
                  AND d.parse_status <> 'deleted'
                  AND COALESCE(d.meta_json->>'rag_backend', 'cloud_kb') IN ('iflytek_chatdoc', 'cloud_kb')
                  AND d.updated_at >= :since_dt
                  AND (:all_courses = true OR d.course_id = CAST(:course_id AS UUID))
                GROUP BY 1
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_uuid)},
        ).mappings().all()
        sync_by_source = {str(row["source"]): int(row["count"] or 0) for row in sync_rows}
        webhook_updates = sync_by_source.get("webhook", 0)
        poll_updates = sync_by_source.get("poll", 0)
        sync_total = webhook_updates + poll_updates
        course_limits = self._course_cost_limits(course_slug)
        cost_today = self.db.execute(
            sa.text(
                f"""
                SELECT COALESCE(SUM((m.meta_json->>'estimated_cost')::numeric), 0) AS cost
                FROM model_call_logs m
                WHERE m.created_at >= :today_start
                  AND (:all_courses = true OR m.course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_model_call_sql("m")}
                """
            ),
            {"today_start": today_start, **self._course_scope_params(course_uuid)},
        ).scalar_one()
        tokens_used = int(tokens_today or 0)
        token_limit = course_limits.get("daily_token_limit")
        cost_limit = course_limits.get("daily_cost_limit")
        cost_used = float(cost_today or 0)
        token_utilization = round((tokens_used / token_limit) * 100, 1) if token_limit else None
        cost_utilization = round((cost_used / cost_limit) * 100, 1) if cost_limit else None
        stream_latency = self.db.execute(
            sa.text(
                f"""
                SELECT AVG(m.latency_ms) AS avg_ms,
                       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY m.latency_ms) AS p95_ms
                FROM model_call_logs m
                WHERE m.created_at >= :since_dt
                  AND m.capability = 'chat'
                  AND (:all_courses = true OR m.course_id = CAST(:course_id AS UUID))
                  AND COALESCE(m.meta_json->>'stream_mode', '') <> ''
                  AND {self._non_demo_model_call_sql("m")}
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_uuid)},
        ).mappings().first()
        return {
            "cost_quota": {
                "tokens_today": tokens_used,
                "daily_token_limit": token_limit,
                "token_utilization_pct": token_utilization,
                "estimated_cost_today": round(cost_used, 4),
                "daily_cost_limit": cost_limit,
                "cost_utilization_pct": cost_utilization,
                "chat_rate_limit_per_minute": settings.CHAT_RATE_LIMIT_PER_MINUTE,
                "resource_task_daily_limit": settings.RESOURCE_TASK_DAILY_LIMIT,
            },
            "link_health": {
                "webhook_path": settings.CHATDOC_WEBHOOK_PATH,
                "webhook_verify_signature": settings.CHATDOC_WEBHOOK_VERIFY_SIGNATURE,
                "status_updates_total": sync_total,
                "webhook_updates": webhook_updates,
                "poll_compensation_updates": poll_updates,
                "webhook_share_pct": round((webhook_updates / sync_total) * 100, 1) if sync_total else None,
                "stuck_docs": int(cloud_ingestion.get("stuck_docs") or 0),
                "processing_docs": int(cloud_ingestion.get("processing_docs") or 0),
                "failed_docs": int(cloud_ingestion.get("failed_docs") or 0),
                "resource_queue_backlog": int(queues.get("resource_backlog") or 0),
            },
            "latency": {
                "rag_avg_ms": int(rag_report.get("avg_latency_ms") or 0),
                "chat_avg_ms": int(model_calls.get("avg_latency_ms") or 0),
                "chat_p95_ms": int(model_calls.get("p95_latency_ms") or 0),
                "stream_chat_avg_ms": round(float(stream_latency["avg_ms"] or 0)) if stream_latency else 0,
                "stream_chat_p95_ms": round(float(stream_latency["p95_ms"] or 0)) if stream_latency else 0,
            },
        }

    def _course_cost_limits(self, course_slug: str | None) -> dict[str, Any]:
        """读取课程模型配置中的每日 Token 和费用上限。"""
        if not course_slug:
            return {"daily_token_limit": None, "daily_cost_limit": None}
        course = self.db.execute(select(Course).where(Course.slug == course_slug)).scalar_one_or_none()
        if not course:
            try:
                course_uuid = uuid.UUID(str(course_slug))
            except (TypeError, ValueError):
                course_uuid = None
            course = self.db.get(Course, course_uuid) if course_uuid else None
        if not course:
            return {"daily_token_limit": None, "daily_cost_limit": None}
        config = course.model_config_json or {}
        cost_limits = config.get("cost_limits") or {}
        token_limit = config.get("daily_token_limit") or cost_limits.get("daily_token_limit")
        cost_limit = cost_limits.get("daily_cost_limit")
        return {
            "daily_token_limit": int(token_limit) if token_limit else None,
            "daily_cost_limit": float(cost_limit) if cost_limit else None,
        }

    def _ai_dialogue_report(self, course_id: str | None, since_dt: datetime) -> dict[str, Any]:
        """汇总 AI 对话成功率、拒答率、模型降级和引用核验问题。"""
        summary = self.db.execute(
            sa.text(
                """
                SELECT COUNT(*) AS total_turns,
                       SUM(CASE WHEN COALESCE(m.meta_json->>'refusal_reason', '') = '' THEN 1 ELSE 0 END) AS success_turns,
                       SUM(CASE WHEN COALESCE(m.meta_json->>'refusal_reason', '') <> '' THEN 1 ELSE 0 END) AS refused_turns,
                       SUM(CASE WHEN COALESCE(m.meta_json->'model_meta'->>'is_fallback', 'false') = 'true' THEN 1 ELSE 0 END) AS fallback_turns
                FROM messages m
                JOIN conversations c ON c.id = m.conversation_id
                WHERE m.role = 'assistant'
                  AND m.created_at >= :since_dt
                  AND (:all_courses = true OR c.course_id = CAST(:course_id AS UUID))
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).mappings().first()
        trace_row = self.db.execute(
            sa.text(
                """
                SELECT AVG(NULLIF((e.payload_json->>'duration_ms')::numeric, 0)) AS avg_step_ms,
                       MAX(NULLIF((e.payload_json->>'duration_ms')::numeric, 0)) AS max_step_ms
                FROM agent_trace_events e
                JOIN conversations c ON c.id = e.conversation_id
                WHERE e.created_at >= :since_dt
                  AND (:all_courses = true OR c.course_id = CAST(:course_id AS UUID))
                  AND COALESCE(e.payload_json->>'duration_ms', '') <> ''
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).mappings().first()
        cite_row = self.db.execute(
            sa.text(
                """
                SELECT COUNT(*) AS cite_checks,
                       SUM(CASE WHEN e.status IN ('blocked', 'warning') THEN 1 ELSE 0 END) AS cite_issues
                FROM agent_trace_events e
                JOIN conversations c ON c.id = e.conversation_id
                WHERE e.created_at >= :since_dt
                  AND e.step = '引用核验'
                  AND (:all_courses = true OR c.course_id = CAST(:course_id AS UUID))
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).mappings().first()
        total = int(summary["total_turns"] or 0) if summary else 0
        success = int(summary["success_turns"] or 0) if summary else 0
        refused = int(summary["refused_turns"] or 0) if summary else 0
        fallback = int(summary["fallback_turns"] or 0) if summary else 0
        cite_checks = int(cite_row["cite_checks"] or 0) if cite_row else 0
        cite_issues = int(cite_row["cite_issues"] or 0) if cite_row else 0
        return {
            "total_turns": total,
            "success_turns": success,
            "success_rate": round((success / total * 100) if total else 0, 1),
            "refusal_rate": round((refused / total * 100) if total else 0, 1),
            "model_fallback_rate": round((fallback / total * 100) if total else 0, 1),
            "avg_trace_step_ms": round(float(trace_row["avg_step_ms"] or 0)) if trace_row else 0,
            "max_trace_step_ms": round(float(trace_row["max_step_ms"] or 0)) if trace_row else 0,
            "cite_check_issues": cite_issues,
            "cite_check_issue_rate": round((cite_issues / cite_checks * 100) if cite_checks else 0, 1),
        }

    def _resource_failure_report(self, course_id: str | None, since_dt: datetime) -> dict[str, Any]:
        """统计近期资源生成失败总量和高频失败原因。"""
        rows = self.db.execute(
            sa.text(
                """
                SELECT COALESCE(NULLIF(error_message, ''), 'unknown') AS reason,
                       COUNT(*) AS count
                FROM resource_generation_tasks
                WHERE created_at >= :since_dt
                  AND status = 'failed'
                  AND (:all_courses = true OR course_id = CAST(:course_id AS UUID))
                GROUP BY reason
                ORDER BY count DESC
                LIMIT 8
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).mappings().all()
        total_failed = sum(int(row["count"] or 0) for row in rows)
        return {
            "failed_tasks": total_failed,
            "top_reasons": [
                {"reason": row["reason"], "count": int(row["count"] or 0)}
                for row in rows
            ],
        }

    def _recent_events(self, course_id: str | None, since_dt: datetime) -> list[dict[str, Any]]:
        """汇总近期安全、模型失败和学习闭环事件。"""
        rows = self.db.execute(
            sa.text(
                f"""
                SELECT 'safety' AS type, event_type AS title, severity, action AS status, note, created_at
                FROM safety_events s
                WHERE s.created_at >= :since_dt
                  AND (:all_courses = true OR s.course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_safety_sql("s")}
                UNION ALL
                SELECT 'model_call' AS type, COALESCE(m.agent_name, '模型调用') AS title, 'medium' AS severity, m.status, m.error_message AS note, m.created_at
                FROM model_call_logs m
                WHERE m.created_at >= :since_dt
                  AND m.status != 'success'
                  AND (:all_courses = true OR m.course_id = CAST(:course_id AS UUID))
                  AND {self._non_demo_model_call_sql("m")}
                UNION ALL
                SELECT 'learning_event' AS type, event_type AS title, 'info' AS severity, COALESCE(source_type, 'closed_loop') AS status, LEFT(COALESCE(evidence_json::text, ''), 240) AS note, created_at
                FROM learning_events
                WHERE created_at >= :since_dt
                  AND (:all_courses = true OR course_id = CAST(:course_id AS UUID))
                ORDER BY created_at DESC
                LIMIT 12
                """
            ),
            {"since_dt": since_dt, **self._course_scope_params(course_id)},
        ).mappings().all()
        return [
            {
                "type": row["type"],
                "title": row["title"],
                "severity": row["severity"],
                "status": row["status"],
                "note": row["note"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            }
            for row in rows
        ]

    def _alerts(
        self,
        overview: dict[str, Any],
        model_calls: dict[str, Any],
        rag_report: dict[str, Any],
        queues: dict[str, Any],
        ai_dialogue: dict[str, Any] | None = None,
        resource_failures: dict[str, Any] | None = None,
        cloud_ops: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """根据核心指标生成运维看板告警和跳转建议。"""
        alerts: list[dict[str, Any]] = []
        if not overview.get("has_runtime_data"):
            return [{
                "level": "info",
                "title": "暂无真实运行数据",
                "message": "已过滤演示种子数据；真实调用、检索、评估或任务产生后会自动汇总到这里。",
                "action_label": "检查模型网关",
                "action_href": "/admin/model-gateway",
                "action_key": "no_runtime_data",
            }]
        if float(overview.get("rag_hit_rate") or rag_report.get("hit_rate") or 0) < 80:
            alerts.append({
                "level": "warning",
                "title": "RAG 命中率偏低",
                "message": "建议检查课程资料覆盖、切片质量和重排序阈值。",
                "action_label": "补充知识库",
                "action_href": "/admin/knowledge-base",
                "action_key": "knowledge_base",
            })
        if float(overview.get("citation_coverage") or rag_report.get("citation_coverage") or 0) < 75:
            alerts.append({
                "level": "warning",
                "title": "引用覆盖不足",
                "message": "低置信回答应触发拒答或引导管理员补充知识库。",
                "action_label": "查看低命中样本",
                "action_href": "/admin/knowledge-base",
                "action_key": "rag_low_samples",
            })
        if float(overview.get("p95_latency") or 0) > 6:
            alerts.append({
                "level": "critical",
                "title": "P95 响应时间过高",
                "message": "优先检查模型网关延迟、队列积压与检索耗时。",
                "action_label": "检查模型网关",
                "action_href": "/admin/model-gateway",
                "action_key": "model_latency",
            })
        if float(model_calls.get("failure_rate") or overview.get("model_failure_rate") or 0) > 3:
            alerts.append({
                "level": "critical",
                "title": "模型调用失败率过高",
                "message": "建议启用备用模型或降低并发批量资源生成。",
                "action_label": "启用备用模型",
                "action_href": "/admin/model-gateway",
                "action_key": "model_fallback",
            })
        cost_quota = (cloud_ops or {}).get("cost_quota") or {}
        if cost_quota.get("token_utilization_pct") is not None and float(cost_quota["token_utilization_pct"]) >= 85:
            alerts.append({
                "level": "critical",
                "title": "课程 Token 额度逼近上限",
                "message": f"今日已用 {cost_quota.get('tokens_today', 0)} / {cost_quota.get('daily_token_limit')} Token，请调整课程日额度或排查异常刷量。",
                "action_label": "模型网关 · 课程额度",
                "action_href": "/admin/model-gateway",
                "action_key": "token_quota",
            })
        link_health = (cloud_ops or {}).get("link_health") or {}
        if int(link_health.get("stuck_docs") or overview.get("cloud_stuck_docs") or 0) > 0:
            alerts.append({
                "level": "warning",
                "title": "云端文档处理卡住",
                "message": f"{link_health.get('stuck_docs', 0)} 份文档超过 2 小时未完成，请检查回调可达性或触发补偿轮询。",
                "action_label": "知识大本营",
                "action_href": "/admin/knowledge-base",
                "action_key": "cloud_stuck",
            })
        if int(queues.get("resource_backlog") or overview.get("queue_backlog") or 0) > 20:
            alerts.append({
                "level": "warning",
                "title": "资源生成队列积压",
                "message": "本平台资源生成任务较多，可暂停低优先级批量生成。",
                "action_label": "查看运维舱",
                "action_href": "/admin/operations-monitoring",
                "action_key": "resource_queue_backlog",
            })
        if int(rag_report.get("refused_queries") or 0) > 5 and float(rag_report.get("hit_rate") or 100) < 60:
            alerts.append({
                "level": "warning",
                "title": "检索拒答与低命中并存",
                "message": "知识库覆盖不足或阈值过严，建议管理员补充教材并复查 Guardrail 配置。",
                "action_label": "知识大本营",
                "action_href": "/admin/knowledge-base",
                "action_key": "guardrail_refusal",
            })
        if ai_dialogue and float(ai_dialogue.get("refusal_rate") or 0) > 20:
            alerts.append({
                "level": "warning",
                "title": "AI 对话拒答率偏高",
                "message": "建议检查知识库覆盖、引用阈值与安全策略是否过严。",
                "action_label": "查看知识库",
                "action_href": "/admin/knowledge-base",
                "action_key": "ai_refusal_rate",
            })
        if ai_dialogue and float(ai_dialogue.get("model_fallback_rate") or 0) > 10:
            alerts.append({
                "level": "warning",
                "title": "模型降级比例偏高",
                "message": "课程 AI 对话频繁走本地降级，请检查模型网关可用性与配额。",
                "action_label": "检查模型网关",
                "action_href": "/admin/model-gateway",
                "action_key": "ai_model_fallback",
            })
        if resource_failures and int(resource_failures.get("failed_tasks") or 0) >= 3:
            top = (resource_failures.get("top_reasons") or [{}])[0]
            alerts.append({
                "level": "warning",
                "title": "资源生成失败增多",
                "message": f"近 {overview.get('days', 7)} 天失败 {resource_failures['failed_tasks']} 次，Top 原因：{top.get('reason', 'unknown')}",
                "action_label": "查看资源任务",
                "action_href": "/admin/operations-monitoring",
                "action_key": "resource_failures",
            })
        if not alerts:
            alerts.append({
                "level": "info",
                "title": "运行状态稳定",
                "message": "核心指标均在 MVP 演示阈值内。",
                "action_label": "复查课程闭环",
                "action_href": "/admin/course-builder",
                "action_key": "course_readiness",
            })
        return alerts
