"""增加文档清理追踪字段

Revision ID: 0019_document_cleanup
Revises: 0018_quality_retrieval
Create Date: 2026-05-31 12:00:00
"""
from alembic import op


revision = "0019_document_cleanup"
down_revision = "0018_quality_retrieval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS cleanup_queued_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS cleanup_completed_at TIMESTAMP WITH TIME ZONE")
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_cleanup_pending ON documents (cleanup_queued_at) WHERE cleanup_queued_at IS NOT NULL AND cleanup_completed_at IS NULL")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_documents_cleanup_pending")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS cleanup_queued_at")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS cleanup_completed_at")