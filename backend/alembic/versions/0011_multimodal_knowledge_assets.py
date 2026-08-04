"""增加多模态知识资产第一、二阶段字段

Revision ID: 0011_multimodal_knowledge_assets
Revises: 0010_learning_events_closure
Create Date: 2026-05-28 10:00:00
"""
from alembic import op


revision = "0011_multimodal_knowledge_assets"
down_revision = "0010_learning_events_closure"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE course_sections ADD COLUMN IF NOT EXISTS meta_json JSONB NOT NULL DEFAULT '{}'::jsonb")
    op.execute("ALTER TABLE course_concepts ADD COLUMN IF NOT EXISTS meta_json JSONB NOT NULL DEFAULT '{}'::jsonb")

    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_hash VARCHAR(128)")
    op.execute("UPDATE documents SET source_hash = content_hash WHERE source_hash IS NULL AND content_hash IS NOT NULL")
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS ingestion_version INTEGER NOT NULL DEFAULT 1")
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS current_parse_task_id UUID")
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS parser_version VARCHAR(120)")
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunker_version VARCHAR(120)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_source_hash ON documents (source_hash)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_current_parse_task_id ON documents (current_parse_task_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_course_source_hash ON documents (course_id, source_hash)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS document_pages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            page_no INTEGER NOT NULL,
            image_uri VARCHAR(500),
            width INTEGER,
            height INTEGER,
            dpi INTEGER,
            heading_candidates_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            page_summary TEXT,
            embedding_model VARCHAR(120),
            embedding_dim INTEGER,
            embedding_status VARCHAR(32) NOT NULL DEFAULT 'pending',
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_document_page_no ON document_pages (document_id, page_no)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_pages_document_id ON document_pages (document_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_pages_course_id ON document_pages (course_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_pages_embedding_status ON document_pages (embedding_status)")

    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS page_asset_id UUID REFERENCES document_pages(id) ON DELETE SET NULL")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS asset_type VARCHAR(32) NOT NULL DEFAULT 'TEXT'")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS heading_path_json JSONB NOT NULL DEFAULT '[]'::jsonb")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS heading_path_text VARCHAR(500)")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS heading_ltree VARCHAR(500)")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS heading_number VARCHAR(64)")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS bbox_json JSONB")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS bbox_norm_json JSONB")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS raw_text TEXT")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS language VARCHAR(64)")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS reading_order_index INTEGER")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS logical_table_id VARCHAR(120)")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS visual_summary TEXT")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS parser_version VARCHAR(120)")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS chunker_version VARCHAR(120)")
    op.execute("UPDATE document_chunks SET heading_path_text = COALESCE(heading_path_text, section_path), raw_text = COALESCE(raw_text, content)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_page_asset_id ON document_chunks (page_asset_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_asset_type ON document_chunks (asset_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_heading_path_text ON document_chunks (heading_path_text)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_heading_ltree ON document_chunks (heading_ltree)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_heading_number ON document_chunks (heading_number)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_logical_table_id ON document_chunks (logical_table_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_parser_version ON document_chunks (parser_version)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_chunker_version ON document_chunks (chunker_version)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_element_asset_type ON document_chunks (concept_id, asset_type)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_element_asset_type")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_chunker_version")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_parser_version")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_logical_table_id")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_heading_number")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_heading_ltree")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_heading_path_text")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_asset_type")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_page_asset_id")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS chunker_version")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS parser_version")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS visual_summary")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS logical_table_id")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS reading_order_index")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS language")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS raw_text")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS bbox_norm_json")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS bbox_json")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS heading_number")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS heading_ltree")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS heading_path_text")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS heading_path_json")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS asset_type")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS page_asset_id")

    op.execute("DROP INDEX IF EXISTS ix_document_pages_embedding_status")
    op.execute("DROP INDEX IF EXISTS ix_document_pages_course_id")
    op.execute("DROP INDEX IF EXISTS ix_document_pages_document_id")
    op.execute("DROP INDEX IF EXISTS uq_document_page_no")
    op.execute("DROP TABLE IF EXISTS document_pages")

    op.execute("DROP INDEX IF EXISTS ix_documents_course_source_hash")
    op.execute("DROP INDEX IF EXISTS ix_documents_current_parse_task_id")
    op.execute("DROP INDEX IF EXISTS ix_documents_source_hash")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS chunker_version")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS parser_version")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS current_parse_task_id")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS ingestion_version")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS source_hash")
    op.execute("ALTER TABLE course_concepts DROP COLUMN IF EXISTS meta_json")
    op.execute("ALTER TABLE course_sections DROP COLUMN IF EXISTS meta_json")