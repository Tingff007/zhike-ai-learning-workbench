"""增加多模态 RAG 路由和向量索引

Revision ID: 0015_multimodal_rag_enhancements
Revises: 0014_clear_resource_hall_seeds
Create Date: 2026-05-30 10:00:00
"""
from alembic import op


revision = "0015_multimodal_rag_enhancements"
down_revision = "0014_clear_resource_hall_seeds"
branch_labels = None
depends_on = None


def upgrade() -> None:
#     op.execute(  # disabled: no pgvector
#         """  # disabled: no pgvector
#         DO $$  # disabled: no pgvector
#         BEGIN  # disabled: no pgvector
#             CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_hnsw  # disabled: no pgvector
#             ON document_chunks USING hnsw (embedding vector_cosine_ops)  # disabled: no pgvector
#             WHERE embedding IS NOT NULL;  # disabled: no pgvector
#         EXCEPTION WHEN others THEN  # disabled: no pgvector
#             RAISE NOTICE 'Skipping document_chunks HNSW index: %', SQLERRM;  # disabled: no pgvector
#         END $$;  # disabled: no pgvector
#         """  # disabled: no pgvector
#     )  # disabled: no pgvector
#     op.execute(  # disabled: no pgvector
#         """  # disabled: no pgvector
#         DO $$  # disabled: no pgvector
#         BEGIN  # disabled: no pgvector
#             CREATE INDEX IF NOT EXISTS ix_document_pages_embedding_hnsw  # disabled: no pgvector
#             ON document_pages USING hnsw (embedding vector_cosine_ops)  # disabled: no pgvector
#             WHERE embedding IS NOT NULL;  # disabled: no pgvector
#         EXCEPTION WHEN others THEN  # disabled: no pgvector
#             RAISE NOTICE 'Skipping document_pages HNSW index: %', SQLERRM;  # disabled: no pgvector
#         END $$;  # disabled: no pgvector
#         """  # disabled: no pgvector
#     )  # disabled: no pgvector
    op.execute("CREATE INDEX IF NOT EXISTS ix_vector_indexes_course_name_model ON vector_indexes (course_id, name, embedding_model)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_vector_indexes_course_name_model")
    # op.execute("DROP INDEX IF EXISTS ix_document_pages_embedding_hnsw")  # disabled: no pgvector
    # op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_hnsw")  # disabled: no pgvector