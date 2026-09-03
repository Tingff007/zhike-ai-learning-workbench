"""增加资源生成队列编排和幂等键

Revision ID: 0022_resource_queue_idempotency
Revises: 0021_resource_task_draft_outline
Create Date: 2026-06-01 12:00:00
"""
from alembic import op


revision = "0022_resource_queue_idempotency"
down_revision = "0021_resource_task_draft_outline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE resource_generation_tasks ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE resource_generation_tasks ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE resource_generation_tasks ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE resource_generation_tasks ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3")
    op.execute("ALTER TABLE resource_generation_tasks ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE resource_generation_tasks ADD COLUMN IF NOT EXISTS worker_id VARCHAR(120)")
    op.execute("ALTER TABLE resource_generation_tasks ADD COLUMN IF NOT EXISTS trace_id VARCHAR(120)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_resource_generation_tasks_worker_id ON resource_generation_tasks (worker_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_resource_generation_tasks_next_retry_at ON resource_generation_tasks (next_retry_at)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS idempotency_keys (
            key VARCHAR(255) NOT NULL,
            scope VARCHAR(64) NOT NULL,
            response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            PRIMARY KEY (key, scope)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_idempotency_keys_expires_at ON idempotency_keys (expires_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS idempotency_keys")
    op.execute("DROP INDEX IF EXISTS ix_resource_generation_tasks_next_retry_at")
    op.execute("DROP INDEX IF EXISTS ix_resource_generation_tasks_worker_id")
    op.execute("ALTER TABLE resource_generation_tasks DROP COLUMN IF EXISTS trace_id")
    op.execute("ALTER TABLE resource_generation_tasks DROP COLUMN IF EXISTS worker_id")
    op.execute("ALTER TABLE resource_generation_tasks DROP COLUMN IF EXISTS next_retry_at")
    op.execute("ALTER TABLE resource_generation_tasks DROP COLUMN IF EXISTS max_attempts")
    op.execute("ALTER TABLE resource_generation_tasks DROP COLUMN IF EXISTS attempt_count")
    op.execute("ALTER TABLE resource_generation_tasks DROP COLUMN IF EXISTS heartbeat_at")
    op.execute("ALTER TABLE resource_generation_tasks DROP COLUMN IF EXISTS locked_at")