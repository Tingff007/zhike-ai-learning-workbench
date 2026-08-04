"""讯飞 ChatDoc 三类套餐余量（本地上限 + 已用统计）

Revision ID: 0028_chatdoc_vendor_quota
Revises: 0027_rag_config_base_url
Create Date: 2026-06-03
"""
from alembic import op


revision = "0028_chatdoc_vendor_quota"
down_revision = "0027_rag_config_base_url"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chatdoc_vendor_quotas (
            integration_key VARCHAR(64) PRIMARY KEY,
            upload_limit_pages INTEGER,
            doc_qa_limit INTEGER,
            extract_limit INTEGER,
            upload_used_pages INTEGER NOT NULL DEFAULT 0,
            doc_qa_used INTEGER NOT NULL DEFAULT 0,
            extract_used INTEGER NOT NULL DEFAULT 0,
            package_note TEXT,
            updated_by_external_id VARCHAR(128),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        """
        INSERT INTO chatdoc_vendor_quotas (integration_key)
        VALUES ('iflytek-chatdoc')
        ON CONFLICT (integration_key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS chatdoc_vendor_quotas")