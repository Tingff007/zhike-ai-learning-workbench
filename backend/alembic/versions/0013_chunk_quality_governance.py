"""增加切片质量治理字段

Revision ID: 0013_chunk_quality_governance
Revises: 0012_page_vectors_and_governance
Create Date: 2026-05-28 16:00:00
"""
from alembic import op


revision = "0013_chunk_quality_governance"
down_revision = "0012_page_vectors_and_governance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS quality_reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS quality_ignored BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS quality_checked_at TIMESTAMP WITH TIME ZONE")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_quality_ignored ON document_chunks (quality_ignored)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_quality_ignored")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS quality_checked_at")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS quality_ignored")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS quality_reasons_json")