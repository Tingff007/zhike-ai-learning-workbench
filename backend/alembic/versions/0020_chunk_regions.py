"""创建切片区域表

Revision ID: 0020_chunk_regions
Revises: 0019_document_cleanup
Create Date: 2026-05-31 14:00:00
"""
from alembic import op


revision = "0020_chunk_regions"
down_revision = "0019_document_cleanup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chunk_regions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
            document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            page_asset_id UUID NULL REFERENCES document_pages(id) ON DELETE SET NULL,
            page_no INTEGER NOT NULL,
            bbox_norm JSONB NOT NULL,
            bbox JSONB,
            region_index INTEGER NOT NULL,
            source VARCHAR(32) NOT NULL DEFAULT 'parser',
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT uq_chunk_region_index UNIQUE (chunk_id, region_index)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_regions_chunk_id ON chunk_regions (chunk_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_regions_page_no ON chunk_regions (page_no)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_regions_document_id ON chunk_regions (document_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS chunk_regions")