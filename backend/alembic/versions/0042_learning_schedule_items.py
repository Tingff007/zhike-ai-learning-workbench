"""新增学习日程表

Revision ID: 0042_learning_schedule_items
Revises: 0041_site_settings
Create Date: 2026-06-07 09:20:00
"""
from __future__ import annotations

from alembic import op


revision = "0042_learning_schedule_items"
down_revision = "0041_site_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """创建可保存学习日程表。"""
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS learning_schedule_items (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
            concept_id UUID REFERENCES course_concepts(id) ON DELETE SET NULL,
            resource_id UUID REFERENCES resources(id) ON DELETE SET NULL,
            path_node_id VARCHAR(160),
            source_type VARCHAR(64) NOT NULL DEFAULT 'manual',
            source_id VARCHAR(160),
            item_type VARCHAR(64) NOT NULL DEFAULT 'focus',
            title VARCHAR(240) NOT NULL,
            description TEXT,
            scheduled_date DATE NOT NULL,
            time_label VARCHAR(32),
            status VARCHAR(32) NOT NULL DEFAULT 'planned',
            priority INTEGER NOT NULL DEFAULT 50,
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_schedule_items_user_id ON learning_schedule_items (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_schedule_items_course_id ON learning_schedule_items (course_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_schedule_items_concept_id ON learning_schedule_items (concept_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_schedule_items_resource_id ON learning_schedule_items (resource_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_schedule_items_path_node_id ON learning_schedule_items (path_node_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_schedule_items_source_type ON learning_schedule_items (source_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_schedule_items_source_id ON learning_schedule_items (source_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_schedule_items_item_type ON learning_schedule_items (item_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_schedule_items_scheduled_date ON learning_schedule_items (scheduled_date)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_schedule_items_status ON learning_schedule_items (status)")


def downgrade() -> None:
    """删除学习日程表。"""
    op.execute("DROP INDEX IF EXISTS ix_learning_schedule_items_status")
    op.execute("DROP INDEX IF EXISTS ix_learning_schedule_items_scheduled_date")
    op.execute("DROP INDEX IF EXISTS ix_learning_schedule_items_item_type")
    op.execute("DROP INDEX IF EXISTS ix_learning_schedule_items_source_id")
    op.execute("DROP INDEX IF EXISTS ix_learning_schedule_items_source_type")
    op.execute("DROP INDEX IF EXISTS ix_learning_schedule_items_path_node_id")
    op.execute("DROP INDEX IF EXISTS ix_learning_schedule_items_resource_id")
    op.execute("DROP INDEX IF EXISTS ix_learning_schedule_items_concept_id")
    op.execute("DROP INDEX IF EXISTS ix_learning_schedule_items_course_id")
    op.execute("DROP INDEX IF EXISTS ix_learning_schedule_items_user_id")
    op.execute("DROP TABLE IF EXISTS learning_schedule_items")