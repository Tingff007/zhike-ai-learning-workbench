"""RAG 接入实例：预置模板与实例键分离（同一预置可多次添加）

Revision ID: 0030_rag_config_preset_key
Revises: 0029_rag_config_icon_file
Create Date: 2026-06-03
"""
from alembic import op


revision = "0030_rag_config_preset_key"
down_revision = "0029_rag_config_icon_file"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE rag_integration_configs
        ADD COLUMN IF NOT EXISTS preset_template_key VARCHAR(64),
        ADD COLUMN IF NOT EXISTS display_label VARCHAR(128)
        """
    )
    op.execute(
        """
        UPDATE rag_integration_configs
        SET preset_template_key = integration_key
        WHERE preset_template_key IS NULL
          AND integration_key IS NOT NULL
          AND integration_key != '_active_selection'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE rag_integration_configs
        DROP COLUMN IF EXISTS display_label,
        DROP COLUMN IF EXISTS preset_template_key
        """
    )