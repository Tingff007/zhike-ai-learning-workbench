"""为 RAG 接入实例增加网关展示标记

Revision ID: 0026_rag_gateway_listed
Revises: 0025_admin_display_name
Create Date: 2026-06-03 12:00:00
"""
from alembic import op


revision = "0026_rag_gateway_listed"
down_revision = "0025_admin_display_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE rag_integration_configs
        ADD COLUMN IF NOT EXISTS gateway_listed BOOLEAN NOT NULL DEFAULT FALSE
        """
    )
    op.execute(
        """
        UPDATE rag_integration_configs
        SET gateway_listed = TRUE
        WHERE integration_key != '_active_selection'
          AND (
            NULLIF(TRIM(app_id), '') IS NOT NULL
            OR api_secret_encrypted IS NOT NULL
          )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE rag_integration_configs
        DROP COLUMN IF EXISTS gateway_listed
        """
    )