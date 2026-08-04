"""增加 ChatDoc 抽取问答影子表

Revision ID: 0032_chatdoc_extracted_qa
Revises: 0031_rag_pipeline_config_json
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0032_chatdoc_extracted_qa"
down_revision = "0031_rag_pipeline_config_json"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if table exists before creating
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "chatdoc_extracted_qa" not in inspector.get_table_names():
        op.create_table(
            "chatdoc_extracted_qa",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=False),
            sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id"), nullable=False),
            sa.Column("iflytek_file_id", sa.String(128), nullable=False),
            sa.Column("vendor_qa_id", sa.String(128), nullable=True),
            sa.Column("question", sa.Text(), nullable=False),
            sa.Column("answer", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.UniqueConstraint("document_id", "vendor_qa_id", name="uq_chatdoc_extracted_qa_doc_vendor"),
        )
        op.create_index("ix_chatdoc_extracted_qa_course_id", "chatdoc_extracted_qa", ["course_id"])
        op.create_index("ix_chatdoc_extracted_qa_document_id", "chatdoc_extracted_qa", ["document_id"])
        op.create_index("ix_chatdoc_extracted_qa_iflytek_file_id", "chatdoc_extracted_qa", ["iflytek_file_id"])


def downgrade() -> None:
    op.drop_index("ix_chatdoc_extracted_qa_iflytek_file_id", table_name="chatdoc_extracted_qa")
    op.drop_index("ix_chatdoc_extracted_qa_document_id", table_name="chatdoc_extracted_qa")
    op.drop_index("ix_chatdoc_extracted_qa_course_id", table_name="chatdoc_extracted_qa")
    op.drop_table("chatdoc_extracted_qa")