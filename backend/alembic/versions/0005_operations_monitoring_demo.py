"""写入运营监控演示数据和 RAG 查询日志

Revision ID: 0005_operations_monitoring_demo
Revises: 0004_seed_resource_review_demo
Create Date: 2026-05-25 18:25:00
"""
from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta, timezone

import sqlalchemy as sa
from alembic import op

revision = "0005_operations_monitoring_demo"
down_revision = "0004_seed_resource_review_demo"
branch_labels = None
depends_on = None

IDS = {
    "course_dl": "77a4dad0-af04-5fe2-813d-724a4ffb56ea",
    "user_zhang": "c030ebbb-d09d-5b5f-b720-7a60950abd8e",
    "concept_bp": "07725b03-d76b-5dfd-8dd1-1cc20c6dc9c2",
    "concept_reg": "92ecc8d4-3b39-516d-b765-0039764d991b",
    "concept_cnn": "9bd625d6-9fbb-5c51-a836-6df10806b34c",
    "concept_attention": "9b885add-e75d-5811-921f-9dd9fb2b4cdc",
    "provider_spark": "a91279f1-2a77-526d-957c-1112e4d7f6ca",
    "provider_deepseek": "686bae5d-104e-57cc-a35e-511d59e24483",
    "provider_zhipu": "0903938d-4586-59c1-8467-b2c1dd6696b1",
    "provider_kimi": "02aebe9b-ddb4-539e-8c2a-f1a3bda51b87",
    "metrics_today": "fea5dd0f-413f-5ed9-a0c5-75c0fbd14282",
}


def dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def make_uuid(name: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"zhike-ops-demo/{name}"))


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS rag_query_logs (
        id UUID PRIMARY KEY,
        course_id UUID NULL REFERENCES courses(id) ON DELETE SET NULL,
        concept_id UUID NULL REFERENCES course_concepts(id) ON DELETE SET NULL,
        conversation_id UUID NULL REFERENCES conversations(id) ON DELETE SET NULL,
        user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        intent VARCHAR(64) NOT NULL DEFAULT 'course_qa',
        query_text TEXT NULL,
        hit BOOLEAN NOT NULL DEFAULT false,
        top_score DOUBLE PRECISION NOT NULL DEFAULT 0,
        citation_count INTEGER NOT NULL DEFAULT 0,
        refused BOOLEAN NOT NULL DEFAULT false,
        latency_ms INTEGER NOT NULL DEFAULT 0,
        retrieval_scope VARCHAR(64) NOT NULL DEFAULT 'course',
        meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
    )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_rag_query_logs_course_id ON rag_query_logs (course_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rag_query_logs_concept_id ON rag_query_logs (concept_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rag_query_logs_created_at ON rag_query_logs (created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rag_query_logs_hit ON rag_query_logs (hit)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rag_query_logs_refused ON rag_query_logs (refused)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rag_query_logs_intent ON rag_query_logs (intent)")

    conn = op.get_bind()
    today = date(2026, 5, 25)
    metrics = [
        (0, 126, 384, 57, 86.4, 81.0, 92.3, 4.8, 1.4, 18, 3),
        (1, 118, 351, 49, 84.7, 79.2, 91.8, 5.1, 1.8, 22, 4),
        (2, 109, 320, 43, 83.5, 77.6, 90.4, 5.7, 2.1, 31, 6),
        (3, 96, 288, 38, 80.9, 74.8, 88.9, 6.2, 2.9, 42, 8),
        (4, 103, 301, 41, 82.1, 76.4, 89.5, 5.9, 2.4, 27, 5),
        (5, 91, 260, 34, 78.6, 72.3, 87.2, 6.8, 3.6, 58, 11),
        (6, 88, 244, 30, 75.2, 70.1, 85.6, 7.4, 4.2, 73, 14),
    ]
    for offset, dau, visits, completed, rag, citation, res_success, p95, fail, backlog, safety in metrics:
        metric_date = today - timedelta(days=offset)
        conn.execute(
            sa.text(
                """
                INSERT INTO usage_metrics_daily (id, metric_date, course_id, dau, course_visits, path_nodes_completed, rag_hit_rate, citation_coverage, resource_success_rate, p95_latency, model_failure_rate, queue_backlog, safety_blocks, meta_json)
                VALUES (:id, :metric_date, :course_id, :dau, :visits, :completed, :rag, :citation, :res_success, :p95, :fail, :backlog, :safety, CAST(:meta AS JSONB))
                ON CONFLICT (id) DO UPDATE SET
                    metric_date = EXCLUDED.metric_date,
                    course_id = EXCLUDED.course_id,
                    dau = EXCLUDED.dau,
                    course_visits = EXCLUDED.course_visits,
                    path_nodes_completed = EXCLUDED.path_nodes_completed,
                    rag_hit_rate = EXCLUDED.rag_hit_rate,
                    citation_coverage = EXCLUDED.citation_coverage,
                    resource_success_rate = EXCLUDED.resource_success_rate,
                    p95_latency = EXCLUDED.p95_latency,
                    model_failure_rate = EXCLUDED.model_failure_rate,
                    queue_backlog = EXCLUDED.queue_backlog,
                    safety_blocks = EXCLUDED.safety_blocks,
                    meta_json = EXCLUDED.meta_json
                """
            ),
            {
                "id": IDS["metrics_today"] if offset == 0 else make_uuid(f"usage-{metric_date.isoformat()}"),
                "metric_date": metric_date,
                "course_id": IDS["course_dl"],
                "dau": dau,
                "visits": visits,
                "completed": completed,
                "rag": rag,
                "citation": citation,
                "res_success": res_success,
                "p95": p95,
                "fail": fail,
                "backlog": backlog,
                "safety": safety,
                "meta": dumps({"source": "ops_demo_seed", "notes": "近 7 天演示指标"}),
            },
        )
        conn.execute(
            sa.text(
                """
                INSERT INTO course_metrics_daily (id, metric_date, course_id, active_learners, avg_mastery, resource_count, assessment_count, meta_json)
                VALUES (:id, :metric_date, :course_id, :active_learners, :avg_mastery, :resource_count, :assessment_count, CAST(:meta AS JSONB))
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {
                "id": make_uuid(f"course-{metric_date.isoformat()}"),
                "metric_date": metric_date,
                "course_id": IDS["course_dl"],
                "active_learners": max(18, int(dau * 0.58)),
                "avg_mastery": round(63.5 + (6 - offset) * 1.2, 1),
                "resource_count": 38 + (6 - offset) * 3,
                "assessment_count": 21 + (6 - offset) * 4,
                "meta": dumps({"source": "ops_demo_seed"}),
            },
        )

    providers = [
        (IDS["provider_deepseek"], "deepseek-chat", "课程检索 Agent", 44, 41, 1120, 430, 1280),
        (IDS["provider_spark"], "spark-x1", "资源生成 Agent", 30, 28, 2360, 1240, 3810),
        (IDS["provider_zhipu"], "glm-4-flash", "引用核验 Agent", 24, 24, 740, 210, 930),
        (IDS["provider_kimi"], "moonshot-v1-32k", "文档伴读 Agent", 18, 17, 5400, 680, 5320),
    ]
    base_time = datetime(2026, 5, 25, 17, 50, tzinfo=timezone.utc)
    idx = 0
    for provider_id, model, agent, calls, successes, input_base, output_base, latency_base in providers:
        for i in range(calls):
            idx += 1
            status = "success" if i < successes else "failed"
            latency = latency_base + (i % 7) * 120
            conn.execute(
                sa.text(
                    """
                    INSERT INTO model_call_logs (id, course_id, user_id, provider_id, agent_name, model_name, token_input, token_output, latency_ms, status, error_message, created_at, updated_at)
                    VALUES (:id, :course_id, :user_id, :provider_id, :agent, :model, :token_input, :token_output, :latency, :status, :error, :created_at, :updated_at)
                    ON CONFLICT (id) DO NOTHING
                    """
                ),
                {
                    "id": make_uuid(f"model-call-{idx}"),
                    "course_id": IDS["course_dl"],
                    "user_id": IDS["user_zhang"],
                    "provider_id": provider_id,
                    "agent": agent,
                    "model": model,
                    "token_input": input_base + (i % 5) * 87,
                    "token_output": output_base + (i % 4) * 43,
                    "latency": latency,
                    "status": status,
                    "error": None if status == "success" else "429 rate limit or upstream timeout",
                    "created_at": base_time - timedelta(hours=i % 24, minutes=i * 3),
                    "updated_at": base_time - timedelta(hours=i % 24, minutes=i * 3),
                },
            )

    rag_rows = [
        ("反向传播为什么要用链式法则？", IDS["concept_bp"], "course_qa", True, 0.84, 3, False, 1880),
        ("Dropout 和 L2 正则化的区别是什么？", IDS["concept_reg"], "course_qa", True, 0.79, 2, False, 2140),
        ("卷积核如何影响特征图大小？", IDS["concept_cnn"], "course_qa", True, 0.82, 3, False, 1960),
        ("Transformer 注意力机制的 QKV 怎么理解？", IDS["concept_attention"], "course_qa", False, 0.58, 0, True, 2420),
        ("给我生成一组 CNN 基础题", IDS["concept_cnn"], "resource_generation", True, 0.76, 2, False, 3310),
        ("解释 BatchNorm 和 LayerNorm 的适用场景", IDS["concept_reg"], "course_qa", True, 0.73, 2, False, 2010),
        ("反向传播代码实验要检查哪些步骤？", IDS["concept_bp"], "assessment", True, 0.81, 2, False, 2680),
        ("某篇未入库论文的精确实验数据是多少？", IDS["concept_attention"], "course_qa", False, 0.41, 0, True, 1740),
        ("把注意力机制整理成思维导图", IDS["concept_attention"], "resource_generation", True, 0.71, 1, False, 3540),
        ("正则化为什么能缓解过拟合？", IDS["concept_reg"], "course_qa", True, 0.86, 3, False, 1920),
    ]
    for i, (query, concept_id, intent, hit, top_score, citation_count, refused, latency) in enumerate(rag_rows, start=1):
        conn.execute(
            sa.text(
                """
                INSERT INTO rag_query_logs (id, course_id, concept_id, user_id, intent, query_text, hit, top_score, citation_count, refused, latency_ms, retrieval_scope, meta_json, created_at, updated_at)
                VALUES (:id, :course_id, :concept_id, :user_id, :intent, :query_text, :hit, :top_score, :citation_count, :refused, :latency_ms, 'course', CAST(:meta AS JSONB), :created_at, :updated_at)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {
                "id": make_uuid(f"rag-query-{i}"),
                "course_id": IDS["course_dl"],
                "concept_id": concept_id,
                "user_id": IDS["user_zhang"],
                "intent": intent,
                "query_text": query,
                "hit": hit,
                "top_score": top_score,
                "citation_count": citation_count,
                "refused": refused,
                "latency_ms": latency,
                "meta": dumps({"demo": True, "threshold": 0.7}),
                "created_at": base_time - timedelta(hours=i * 2),
                "updated_at": base_time - timedelta(hours=i * 2),
            },
        )

    safety_rows = [
        ("academic_integrity", "medium", "warned", "用户请求直接代写课程报告，已提示改为学习辅导。"),
        ("privacy", "low", "logged", "上传文档中检测到疑似手机号，已在日志中脱敏。"),
        ("low_confidence", "medium", "refused", "当前课程知识库未找到可靠来源，系统拒绝编造引用。"),
    ]
    for i, (event_type, severity, action, note) in enumerate(safety_rows, start=1):
        conn.execute(
            sa.text(
                """
                INSERT INTO safety_events (id, course_id, user_id, event_type, severity, action, note, meta_json, created_at, updated_at)
                VALUES (:id, :course_id, :user_id, :event_type, :severity, :action, :note, CAST(:meta AS JSONB), :created_at, :updated_at)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {
                "id": make_uuid(f"safety-{i}"),
                "course_id": IDS["course_dl"],
                "user_id": IDS["user_zhang"],
                "event_type": event_type,
                "severity": severity,
                "action": action,
                "note": note,
                "meta": dumps({"source": "ops_demo_seed"}),
                "created_at": base_time - timedelta(hours=i * 3),
                "updated_at": base_time - timedelta(hours=i * 3),
            },
        )


def downgrade() -> None:
    conn = op.get_bind()
    for table, prefix, count in [
        ("safety_events", "safety", 3),
        ("rag_query_logs", "rag-query", 10),
        ("model_call_logs", "model-call", 116),
    ]:
        for i in range(1, count + 1):
            conn.execute(sa.text(f"DELETE FROM {table} WHERE id = :id"), {"id": make_uuid(f"{prefix}-{i}")})
    # 恢复 0002 中的原始演示行，并删除额外的六条趋势行。
    conn.execute(
        sa.text(
            """
            UPDATE usage_metrics_daily
            SET dau = 428, course_visits = 1862, path_nodes_completed = 734,
                rag_hit_rate = 0.86, citation_coverage = 0.83, resource_success_rate = 0.94,
                p95_latency = 4.8, model_failure_rate = 0.016, queue_backlog = 12, safety_blocks = 17,
                meta_json = CAST(:meta AS JSONB)
            WHERE id = :id
            """
        ),
        {"id": IDS["metrics_today"], "meta": dumps({"source": "seed", "window": "latest_demo"})},
    )
    for offset in range(1, 7):
        metric_date = date(2026, 5, 25) - timedelta(days=offset)
        conn.execute(sa.text("DELETE FROM usage_metrics_daily WHERE id = :id"), {"id": make_uuid(f"usage-{metric_date.isoformat()}")})
        conn.execute(sa.text("DELETE FROM course_metrics_daily WHERE id = :id"), {"id": make_uuid(f"course-{metric_date.isoformat()}")})
    conn.execute(sa.text("DELETE FROM course_metrics_daily WHERE id = :id"), {"id": make_uuid("course-2026-05-25")})
    op.drop_index("ix_rag_query_logs_intent", table_name="rag_query_logs")
    op.drop_index("ix_rag_query_logs_refused", table_name="rag_query_logs")
    op.drop_index("ix_rag_query_logs_hit", table_name="rag_query_logs")
    op.drop_index("ix_rag_query_logs_created_at", table_name="rag_query_logs")
    op.drop_index("ix_rag_query_logs_concept_id", table_name="rag_query_logs")
    op.drop_index("ix_rag_query_logs_course_id", table_name="rag_query_logs")
    op.drop_table("rag_query_logs")