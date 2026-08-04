"""增加学习事件以支撑闭环证据

Revision ID: 0010_learning_events_closure
Revises: 0009_market_embedding_gateway
Create Date: 2026-05-27 18:00:00
"""
from alembic import op


revision = "0010_learning_events_closure"
down_revision = "0009_market_embedding_gateway"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS learning_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            concept_id UUID REFERENCES course_concepts(id) ON DELETE SET NULL,
            event_type VARCHAR(80) NOT NULL,
            source_type VARCHAR(80),
            source_id VARCHAR(160),
            evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_events_course_id ON learning_events (course_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_events_user_id ON learning_events (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_events_concept_id ON learning_events (concept_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_events_event_type ON learning_events (event_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_events_source_type ON learning_events (source_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_events_source_id ON learning_events (source_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_events_course_created ON learning_events (course_id, created_at DESC)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_learning_events_course_created")
    op.execute("DROP INDEX IF EXISTS ix_learning_events_source_id")
    op.execute("DROP INDEX IF EXISTS ix_learning_events_source_type")
    op.execute("DROP INDEX IF EXISTS ix_learning_events_event_type")
    op.execute("DROP INDEX IF EXISTS ix_learning_events_concept_id")
    op.execute("DROP INDEX IF EXISTS ix_learning_events_user_id")
    op.execute("DROP INDEX IF EXISTS ix_learning_events_course_id")
    op.execute("DROP TABLE IF EXISTS learning_events")