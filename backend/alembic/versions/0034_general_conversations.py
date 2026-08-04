"""允许通用学习会话不绑定课程

Revision ID: 0034_general_conversations
Revises: 0033_native_chunk_revisions
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0034_general_conversations"
down_revision = "0033_native_chunk_revisions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "conversations",
        "course_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )


def downgrade() -> None:
    op.execute("DELETE FROM conversations WHERE course_id IS NULL")
    op.alter_column(
        "conversations",
        "course_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )