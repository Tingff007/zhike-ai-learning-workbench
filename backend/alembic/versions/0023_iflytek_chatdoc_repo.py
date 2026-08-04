"""为 ChatDoc 集成增加课程知识库标识

Revision ID: 0023_iflytek_chatdoc_repo
Revises: 0022_resource_queue_idempotency
Create Date: 2026-06-02 12:00:00
"""
from alembic import op


revision = "0023_iflytek_chatdoc_repo"
down_revision = "0022_resource_queue_idempotency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS iflytek_repo_id VARCHAR(64)")


def downgrade() -> None:
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS iflytek_repo_id")