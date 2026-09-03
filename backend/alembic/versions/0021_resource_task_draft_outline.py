"""为资源生成任务增加草稿内容和大纲字段

Revision ID: 0021_resource_task_draft_outline
Revises: 0020_chunk_regions
Create Date: 2026-06-01 10:00:00
"""
from alembic import op


revision = "0021_resource_task_draft_outline"
down_revision = "0020_chunk_regions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE resource_generation_tasks
        ADD COLUMN IF NOT EXISTS draft_content TEXT NULL
        """
    )
    op.execute(
        """
        ALTER TABLE resource_generation_tasks
        ADD COLUMN IF NOT EXISTS outline_json JSONB NOT NULL DEFAULT '[]'::jsonb
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE resource_generation_tasks DROP COLUMN IF EXISTS outline_json")
    op.execute("ALTER TABLE resource_generation_tasks DROP COLUMN IF EXISTS draft_content")