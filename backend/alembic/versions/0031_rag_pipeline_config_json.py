"""RAG 接入：ChatDoc 流水线参数 JSON

Revision ID: 0031_rag_pipeline_config_json
Revises: 0030_rag_config_preset_key
Create Date: 2026-06-03
"""
from alembic import op


revision = "0031_rag_pipeline_config_json"
down_revision = "0030_rag_config_preset_key"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE rag_integration_configs
        ADD COLUMN IF NOT EXISTS pipeline_config_json TEXT
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE rag_integration_configs
        DROP COLUMN IF EXISTS pipeline_config_json
        """
    )