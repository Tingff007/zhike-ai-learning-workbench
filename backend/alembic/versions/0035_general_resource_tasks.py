"""允许通用资源不绑定课程

Revision ID: 0035_general_resource_tasks
Revises: 0034_general_conversations
"""

from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0035_general_resource_tasks"
down_revision = "0034_general_conversations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "resources",
        "course_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.alter_column(
        "resource_generation_tasks",
        "course_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.alter_column(
        "community_resources",
        "course_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )


def downgrade() -> None:
    op.execute("DELETE FROM community_resources WHERE course_id IS NULL")
    op.execute("DELETE FROM resource_generation_tasks WHERE course_id IS NULL")
    op.execute("DELETE FROM resources WHERE course_id IS NULL")
    op.alter_column(
        "community_resources",
        "course_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
    op.alter_column(
        "resource_generation_tasks",
        "course_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
    op.alter_column(
        "resources",
        "course_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )