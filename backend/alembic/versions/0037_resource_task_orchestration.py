"""增加资源任务编排元数据

Revision ID: 0037_resource_task_orchestration
Revises: 0036_learning_profile_scopes
Create Date: 2026-06-06 12:00:00
"""
from alembic import op


revision = "0037_resource_task_orchestration"
down_revision = "0036_learning_profile_scopes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE resource_generation_tasks "
        "ADD COLUMN IF NOT EXISTS orchestration_json JSONB NOT NULL DEFAULT '{}'::jsonb"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE resource_generation_tasks DROP COLUMN IF EXISTS orchestration_json")