"""为通用 RAG 接入凭证增加基础地址

Revision ID: 0027_rag_config_base_url
Revises: 0026_rag_gateway_listed
Create Date: 2026-06-03 14:00:00
"""
from alembic import op


revision = "0027_rag_config_base_url"
down_revision = "0026_rag_gateway_listed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE rag_integration_configs
        ADD COLUMN IF NOT EXISTS base_url VARCHAR(512)
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE rag_integration_configs
        DROP COLUMN IF EXISTS base_url
        """
    )