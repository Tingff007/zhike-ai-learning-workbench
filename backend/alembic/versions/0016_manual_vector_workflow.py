"""增加人工审核和向量化工作流

Revision ID: 0016_manual_vector_workflow
Revises: 0015_multimodal_rag_enhancements
Create Date: 2026-05-30 11:30:00
"""
from alembic import op


revision = "0016_manual_vector_workflow"
down_revision = "0015_multimodal_rag_enhancements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS text_vector_status VARCHAR(32) NOT NULL DEFAULT 'pending_review'")
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS visual_vector_status VARCHAR(32) NOT NULL DEFAULT 'pending_review'")
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS review_status VARCHAR(32) NOT NULL DEFAULT 'pending'")
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS publish_readiness VARCHAR(32) NOT NULL DEFAULT 'blocked'")
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_text_vector_status ON documents (text_vector_status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_visual_vector_status ON documents (visual_vector_status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_review_status ON documents (review_status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_publish_readiness ON documents (publish_readiness)")

    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(32) NOT NULL DEFAULT 'active'")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding_status VARCHAR(32) NOT NULL DEFAULT 'pending'")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS content_version INTEGER NOT NULL DEFAULT 1")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedded_content_version INTEGER")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedded_content_hash VARCHAR(128)")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding_deleted_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding_error TEXT")
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS generation_id VARCHAR(64)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_lifecycle_status ON document_chunks (lifecycle_status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_status ON document_chunks (embedding_status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_embedded_content_hash ON document_chunks (embedded_content_hash)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_generation_id ON document_chunks (generation_id)")

    op.execute("ALTER TABLE document_pages ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(32) NOT NULL DEFAULT 'active'")
    op.execute("ALTER TABLE document_pages ADD COLUMN IF NOT EXISTS visual_embedding_status VARCHAR(32) NOT NULL DEFAULT 'pending'")
    op.execute("ALTER TABLE document_pages ADD COLUMN IF NOT EXISTS visual_content_hash VARCHAR(128)")
    op.execute("ALTER TABLE document_pages ADD COLUMN IF NOT EXISTS embedded_visual_content_hash VARCHAR(128)")
    op.execute("ALTER TABLE document_pages ADD COLUMN IF NOT EXISTS visual_embedding_deleted_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE document_pages ADD COLUMN IF NOT EXISTS embedding_error TEXT")
    op.execute("ALTER TABLE document_pages ADD COLUMN IF NOT EXISTS generation_id VARCHAR(64)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_pages_lifecycle_status ON document_pages (lifecycle_status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_pages_visual_embedding_status ON document_pages (visual_embedding_status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_pages_visual_content_hash ON document_pages (visual_content_hash)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_pages_embedded_visual_content_hash ON document_pages (embedded_visual_content_hash)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_pages_generation_id ON document_pages (generation_id)")

#     op.execute(  # disabled: no pgvector
#         """  # disabled: no pgvector
#         UPDATE document_chunks  # disabled: no pgvector
#         SET lifecycle_status = CASE WHEN quality_ignored THEN 'ignored' ELSE 'active' END,  # disabled: no pgvector
#             embedding_status = CASE  # disabled: no pgvector
#                 WHEN quality_ignored THEN 'skipped'  # disabled: no pgvector
#                 WHEN embedding IS NOT NULL THEN 'ready'  # disabled: no pgvector
#                 ELSE 'pending'  # disabled: no pgvector
#             END,  # disabled: no pgvector
#             embedded_content_version = CASE WHEN embedding IS NOT NULL THEN content_version ELSE NULL END,  # disabled: no pgvector
#             embedded_content_hash = CASE WHEN embedding IS NOT NULL THEN content_hash ELSE NULL END  # disabled: no pgvector
#         """  # disabled: no pgvector
#     )  # disabled: no pgvector
#     op.execute(  # disabled: no pgvector
#         """  # disabled: no pgvector
#         UPDATE document_pages  # disabled: no pgvector
#         SET lifecycle_status = 'active',  # disabled: no pgvector
#             visual_content_hash = COALESCE(visual_content_hash, md5(COALESCE(page_summary, '') || '|' || COALESCE(image_uri, ''))),  # disabled: no pgvector
#             visual_embedding_status = CASE  # disabled: no pgvector
#                 WHEN embedding IS NOT NULL OR embedding_status = 'ready' THEN 'ready'  # disabled: no pgvector
#                 WHEN embedding_status IN ('failed', 'skipped') THEN embedding_status  # disabled: no pgvector
#                 ELSE 'pending'  # disabled: no pgvector
#             END,  # disabled: no pgvector
#             embedded_visual_content_hash = CASE  # disabled: no pgvector
#                 WHEN embedding IS NOT NULL OR embedding_status = 'ready'  # disabled: no pgvector
#                 THEN COALESCE(visual_content_hash, md5(COALESCE(page_summary, '') || '|' || COALESCE(image_uri, '')))  # disabled: no pgvector
#                 ELSE NULL  # disabled: no pgvector
#             END  # disabled: no pgvector
#         """  # disabled: no pgvector
#     )  # disabled: no pgvector
    op.execute(
        """
        UPDATE documents
        SET text_vector_status = CASE
                WHEN vector_status IN ('ready', 'indexed') THEN 'ready'
                WHEN vector_status IN ('indexing', 'vectorizing') THEN 'vectorizing'
                WHEN vector_status = 'failed' THEN 'failed'
                WHEN vector_status = 'skipped' THEN 'skipped'
                ELSE 'pending_review'
            END,
            visual_vector_status = CASE
                WHEN vector_status IN ('ready', 'indexed') THEN 'ready'
                WHEN vector_status IN ('indexing', 'vectorizing') THEN 'vectorizing'
                WHEN vector_status = 'failed' THEN 'failed'
                WHEN vector_status = 'skipped' THEN 'skipped'
                ELSE 'pending_review'
            END,
            vector_status = CASE
                WHEN vector_status IN ('ready', 'indexed') THEN 'ready'
                WHEN vector_status IN ('indexing', 'vectorizing') THEN 'vectorizing'
                WHEN vector_status = 'failed' THEN 'failed'
                WHEN vector_status = 'skipped' THEN 'skipped'
                ELSE 'pending_review'
            END,
            publish_readiness = CASE WHEN vector_status IN ('ready', 'indexed') THEN 'ready' ELSE 'blocked' END
        """
    )

#     op.execute(  # disabled: no pgvector
#         """  # disabled: no pgvector
#         CREATE TABLE IF NOT EXISTS vectorization_tasks (  # disabled: no pgvector
#             id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  # disabled: no pgvector
#             parent_task_id UUID NULL REFERENCES vectorization_tasks(id) ON DELETE SET NULL,  # disabled: no pgvector
#             scope_type VARCHAR(32) NOT NULL,  # disabled: no pgvector
#             scope_id VARCHAR(120) NOT NULL,  # disabled: no pgvector
#             document_id UUID NULL REFERENCES documents(id) ON DELETE SET NULL,  # disabled: no pgvector
#             idempotency_key VARCHAR(255),  # disabled: no pgvector
#             status VARCHAR(32) NOT NULL DEFAULT 'queued',  # disabled: no pgvector
#             mode VARCHAR(32) NOT NULL DEFAULT 'stale_only',  # disabled: no pgvector
#             include_pages BOOLEAN NOT NULL DEFAULT true,  # disabled: no pgvector
#             clear_old BOOLEAN NOT NULL DEFAULT false,  # disabled: no pgvector
#             generation_id VARCHAR(64) NOT NULL,  # disabled: no pgvector
#             created_by VARCHAR(120),  # disabled: no pgvector
#             created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),  # disabled: no pgvector
#             updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),  # disabled: no pgvector
#             started_at TIMESTAMP WITH TIME ZONE,  # disabled: no pgvector
#             finished_at TIMESTAMP WITH TIME ZONE,  # disabled: no pgvector
#             cancelled_at TIMESTAMP WITH TIME ZONE,  # disabled: no pgvector
#             locked_at TIMESTAMP WITH TIME ZONE,  # disabled: no pgvector
#             heartbeat_at TIMESTAMP WITH TIME ZONE,  # disabled: no pgvector
#             total_items INTEGER NOT NULL DEFAULT 0,  # disabled: no pgvector
#             succeeded_items INTEGER NOT NULL DEFAULT 0,  # disabled: no pgvector
#             failed_items INTEGER NOT NULL DEFAULT 0,  # disabled: no pgvector
#             stale_skipped_items INTEGER NOT NULL DEFAULT 0,  # disabled: no pgvector
#             error_summary TEXT,  # disabled: no pgvector
#             result_json JSONB NOT NULL DEFAULT '{}'::jsonb  # disabled: no pgvector
#         )  # disabled: no pgvector
#         """  # disabled: no pgvector
#     )  # disabled: no pgvector
    # op.execute("CREATE INDEX IF NOT EXISTS ix_vectorization_tasks_parent_task_id ON vectorization_tasks (parent_task_id)")  # disabled: no pgvector
    # op.execute("CREATE INDEX IF NOT EXISTS ix_vectorization_tasks_scope_type ON vectorization_tasks (scope_type)")  # disabled: no pgvector
    # op.execute("CREATE INDEX IF NOT EXISTS ix_vectorization_tasks_scope_id ON vectorization_tasks (scope_id)")  # disabled: no pgvector
    # op.execute("CREATE INDEX IF NOT EXISTS ix_vectorization_tasks_document_id ON vectorization_tasks (document_id)")  # disabled: no pgvector
    # op.execute("CREATE INDEX IF NOT EXISTS ix_vectorization_tasks_idempotency_key ON vectorization_tasks (idempotency_key)")  # disabled: no pgvector
    # op.execute("CREATE INDEX IF NOT EXISTS ix_vectorization_tasks_status ON vectorization_tasks (status)")  # disabled: no pgvector
    # op.execute("CREATE INDEX IF NOT EXISTS ix_vectorization_tasks_generation_id ON vectorization_tasks (generation_id)")  # disabled: no pgvector
    # op.execute("CREATE INDEX IF NOT EXISTS ix_vectorization_tasks_created_by ON vectorization_tasks (created_by)")  # disabled: no pgvector


def downgrade() -> None:
    # op.execute("DROP TABLE IF EXISTS vectorization_tasks")  # disabled: no pgvector
    op.execute("DROP INDEX IF EXISTS ix_document_pages_generation_id")
    op.execute("DROP INDEX IF EXISTS ix_document_pages_embedded_visual_content_hash")
    op.execute("DROP INDEX IF EXISTS ix_document_pages_visual_content_hash")
    op.execute("DROP INDEX IF EXISTS ix_document_pages_visual_embedding_status")
    op.execute("DROP INDEX IF EXISTS ix_document_pages_lifecycle_status")
    op.execute("ALTER TABLE document_pages DROP COLUMN IF EXISTS generation_id")
    op.execute("ALTER TABLE document_pages DROP COLUMN IF EXISTS embedding_error")
    op.execute("ALTER TABLE document_pages DROP COLUMN IF EXISTS visual_embedding_deleted_at")
    op.execute("ALTER TABLE document_pages DROP COLUMN IF EXISTS embedded_visual_content_hash")
    op.execute("ALTER TABLE document_pages DROP COLUMN IF EXISTS visual_content_hash")
    op.execute("ALTER TABLE document_pages DROP COLUMN IF EXISTS visual_embedding_status")
    op.execute("ALTER TABLE document_pages DROP COLUMN IF EXISTS lifecycle_status")

    op.execute("DROP INDEX IF EXISTS ix_document_chunks_generation_id")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedded_content_hash")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_status")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_lifecycle_status")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS generation_id")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding_error")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding_deleted_at")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedded_content_hash")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedded_content_version")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS content_version")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding_status")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS lifecycle_status")

    op.execute("DROP INDEX IF EXISTS ix_documents_publish_readiness")
    op.execute("DROP INDEX IF EXISTS ix_documents_review_status")
    op.execute("DROP INDEX IF EXISTS ix_documents_visual_vector_status")
    op.execute("DROP INDEX IF EXISTS ix_documents_text_vector_status")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS deleted_at")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS publish_readiness")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS review_status")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS visual_vector_status")
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS text_vector_status")