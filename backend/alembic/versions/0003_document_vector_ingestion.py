"""为上传文档切片增加 pgvector 向量列和索引

Revision ID: 0003_document_vector_ingestion
Revises: 0002_seed_deep_learning
Create Date: 2026-05-25 17:55:00
"""
from alembic import op

revision = "0003_document_vector_ingestion"
down_revision = "0002_seed_deep_learning"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # op.execute("CREATE EXTENSION IF NOT EXISTS vector")  # disabled
    # op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding vector")  # disabled: no pgvector
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_course_embedding_model ON document_chunks (course_id, embedding_model)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_course_parse_status ON documents (course_id, parse_status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_documents_course_vector_status ON documents (course_id, vector_status)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_documents_course_vector_status")
    op.execute("DROP INDEX IF EXISTS ix_documents_course_parse_status")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_course_embedding_model")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding")