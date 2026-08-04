"""增加生产级任务编排字段

Revision ID: 0017_prod_tasks
Revises: 0016_manual_vector_workflow
Create Date: 2026-05-30 17:00:00
"""
from alembic import op


revision = "0017_prod_tasks"
down_revision = "0016_manual_vector_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE document_parse_tasks ADD COLUMN IF NOT EXISTS stage VARCHAR(64) NOT NULL DEFAULT 'queued'")
    op.execute("ALTER TABLE document_parse_tasks ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE document_parse_tasks ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE document_parse_tasks ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE document_parse_tasks ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE document_parse_tasks ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE document_parse_tasks ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3")
    op.execute("ALTER TABLE document_parse_tasks ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE document_parse_tasks ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER NOT NULL DEFAULT 900")
    op.execute("ALTER TABLE document_parse_tasks ADD COLUMN IF NOT EXISTS worker_id VARCHAR(120)")
    op.execute("ALTER TABLE document_parse_tasks ADD COLUMN IF NOT EXISTS trace_id VARCHAR(120)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_parse_tasks_stage ON document_parse_tasks (stage)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_parse_tasks_worker_id ON document_parse_tasks (worker_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_parse_tasks_trace_id ON document_parse_tasks (trace_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_parse_tasks_next_retry_at ON document_parse_tasks (next_retry_at)")

    # op.execute("ALTER TABLE vectorization_tasks ADD COLUMN IF NOT EXISTS stage VARCHAR(64) NOT NULL DEFAULT 'queued'")  # disabled: no pgvector
    # op.execute("ALTER TABLE vectorization_tasks ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0")  # disabled: no pgvector
    # op.execute("ALTER TABLE vectorization_tasks ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3")  # disabled: no pgvector
    # op.execute("ALTER TABLE vectorization_tasks ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE")  # disabled: no pgvector
    # op.execute("ALTER TABLE vectorization_tasks ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER NOT NULL DEFAULT 1800")  # disabled: no pgvector
    # op.execute("ALTER TABLE vectorization_tasks ADD COLUMN IF NOT EXISTS worker_id VARCHAR(120)")  # disabled: no pgvector
    # op.execute("ALTER TABLE vectorization_tasks ADD COLUMN IF NOT EXISTS trace_id VARCHAR(120)")  # disabled: no pgvector
    # op.execute("CREATE INDEX IF NOT EXISTS ix_vectorization_tasks_stage ON vectorization_tasks (stage)")  # disabled: no pgvector
    # op.execute("CREATE INDEX IF NOT EXISTS ix_vectorization_tasks_worker_id ON vectorization_tasks (worker_id)")  # disabled: no pgvector
    # op.execute("CREATE INDEX IF NOT EXISTS ix_vectorization_tasks_trace_id ON vectorization_tasks (trace_id)")  # disabled: no pgvector
    # op.execute("CREATE INDEX IF NOT EXISTS ix_vectorization_tasks_next_retry_at ON vectorization_tasks (next_retry_at)")  # disabled: no pgvector

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS task_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            task_id VARCHAR(120) NOT NULL,
            task_type VARCHAR(32) NOT NULL,
            stage VARCHAR(64) NOT NULL,
            status VARCHAR(32) NOT NULL,
            message TEXT,
            worker_id VARCHAR(120),
            trace_id VARCHAR(120),
            metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_task_events_task_id ON task_events (task_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_task_events_task_type ON task_events (task_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_task_events_stage ON task_events (stage)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_task_events_status ON task_events (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_task_events_worker_id ON task_events (worker_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_task_events_trace_id ON task_events (trace_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS task_events")

    # op.execute("DROP INDEX IF EXISTS ix_vectorization_tasks_next_retry_at")  # disabled: no pgvector
    # op.execute("DROP INDEX IF EXISTS ix_vectorization_tasks_trace_id")  # disabled: no pgvector
    # op.execute("DROP INDEX IF EXISTS ix_vectorization_tasks_worker_id")  # disabled: no pgvector
    # op.execute("DROP INDEX IF EXISTS ix_vectorization_tasks_stage")  # disabled: no pgvector
    # op.execute("ALTER TABLE vectorization_tasks DROP COLUMN IF EXISTS trace_id")  # disabled: no pgvector
    # op.execute("ALTER TABLE vectorization_tasks DROP COLUMN IF EXISTS worker_id")  # disabled: no pgvector
    # op.execute("ALTER TABLE vectorization_tasks DROP COLUMN IF EXISTS timeout_seconds")  # disabled: no pgvector
    # op.execute("ALTER TABLE vectorization_tasks DROP COLUMN IF EXISTS next_retry_at")  # disabled: no pgvector
    # op.execute("ALTER TABLE vectorization_tasks DROP COLUMN IF EXISTS max_attempts")  # disabled: no pgvector
    # op.execute("ALTER TABLE vectorization_tasks DROP COLUMN IF EXISTS attempt_count")  # disabled: no pgvector
    # op.execute("ALTER TABLE vectorization_tasks DROP COLUMN IF EXISTS stage")  # disabled: no pgvector

    op.execute("DROP INDEX IF EXISTS ix_document_parse_tasks_next_retry_at")
    op.execute("DROP INDEX IF EXISTS ix_document_parse_tasks_trace_id")
    op.execute("DROP INDEX IF EXISTS ix_document_parse_tasks_worker_id")
    op.execute("DROP INDEX IF EXISTS ix_document_parse_tasks_stage")
    op.execute("ALTER TABLE document_parse_tasks DROP COLUMN IF EXISTS trace_id")
    op.execute("ALTER TABLE document_parse_tasks DROP COLUMN IF EXISTS worker_id")
    op.execute("ALTER TABLE document_parse_tasks DROP COLUMN IF EXISTS timeout_seconds")
    op.execute("ALTER TABLE document_parse_tasks DROP COLUMN IF EXISTS next_retry_at")
    op.execute("ALTER TABLE document_parse_tasks DROP COLUMN IF EXISTS max_attempts")
    op.execute("ALTER TABLE document_parse_tasks DROP COLUMN IF EXISTS attempt_count")
    op.execute("ALTER TABLE document_parse_tasks DROP COLUMN IF EXISTS heartbeat_at")
    op.execute("ALTER TABLE document_parse_tasks DROP COLUMN IF EXISTS locked_at")
    op.execute("ALTER TABLE document_parse_tasks DROP COLUMN IF EXISTS finished_at")
    op.execute("ALTER TABLE document_parse_tasks DROP COLUMN IF EXISTS started_at")
    op.execute("ALTER TABLE document_parse_tasks DROP COLUMN IF EXISTS stage")