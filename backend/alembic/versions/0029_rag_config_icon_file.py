"""RAG 接入实例可选自定义图标

Revision ID: 0029_rag_config_icon_file
Revises: 0028_chatdoc_vendor_quota
Create Date: 2026-06-03
"""
from alembic import op


revision = "0029_rag_config_icon_file"
down_revision = "0028_chatdoc_vendor_quota"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE rag_integration_configs
        ADD COLUMN IF NOT EXISTS icon_file VARCHAR(128)
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE rag_integration_configs
        DROP COLUMN IF EXISTS icon_file
        """
    )