"""增加页面向量和知识治理端点字段

Revision ID: 0012_page_vectors_and_governance
Revises: 0011_multimodal_knowledge_assets
Create Date: 2026-05-28 14:00:00
"""
from alembic import op


revision = "0012_page_vectors_and_governance"
down_revision = "0011_multimodal_knowledge_assets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # op.execute("ALTER TABLE document_pages ADD COLUMN IF NOT EXISTS embedding vector")  # disabled: no pgvector
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_pages_course_embedding_model ON document_pages (course_id, embedding_model)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_document_pages_course_embedding_model")
    op.execute("ALTER TABLE document_pages DROP COLUMN IF EXISTS embedding")