"""增加原生切片回滚版本快照

Revision ID: 0033_native_chunk_revisions
Revises: 0032_chatdoc_extracted_qa
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0033_native_chunk_revisions"
down_revision = "0032_chatdoc_extracted_qa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if table exists before creating
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "chatdoc_native_chunk_revisions" not in inspector.get_table_names():
        op.create_table(
            "chatdoc_native_chunk_revisions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("revision_no", sa.Integer(), nullable=False),
            sa.Column("label", sa.String(255), nullable=False),
            sa.Column("source", sa.String(32), nullable=False, server_default="auto_sync"),
            sa.Column("is_baseline", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("chunks_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.UniqueConstraint("document_id", "revision_no", name="uq_native_chunk_revision_no"),
        )
        op.create_index("ix_native_chunk_revisions_document_id", "chatdoc_native_chunk_revisions", ["document_id"])
        op.create_index("ix_native_chunk_revisions_is_baseline", "chatdoc_native_chunk_revisions", ["document_id", "is_baseline"])


def downgrade() -> None:
    op.drop_index("ix_native_chunk_revisions_is_baseline", table_name="chatdoc_native_chunk_revisions")
    op.drop_index("ix_native_chunk_revisions_document_id", table_name="chatdoc_native_chunk_revisions")
    op.drop_table("chatdoc_native_chunk_revisions")