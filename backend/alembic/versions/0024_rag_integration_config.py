"""增加 ChatDoc 管理凭证的 RAG 接入配置表

Revision ID: 0024_rag_integration_config
Revises: 0023_iflytek_chatdoc_repo
Create Date: 2026-06-02 18:00:00
"""
from alembic import op


revision = "0024_rag_integration_config"
down_revision = "0023_iflytek_chatdoc_repo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS rag_integration_configs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            integration_key VARCHAR(64) NOT NULL UNIQUE,
            app_id VARCHAR(128),
            api_secret_encrypted TEXT,
            wiki_filter_score DOUBLE PRECISION,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            last_test_status VARCHAR(32),
            last_test_message TEXT,
            last_tested_at TIMESTAMPTZ,
            updated_by_external_id VARCHAR(128),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_rag_integration_configs_key ON rag_integration_configs (integration_key)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS rag_integration_configs")