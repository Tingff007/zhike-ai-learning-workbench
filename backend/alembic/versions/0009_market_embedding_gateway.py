"""增加面向商业化的向量模型网关配置

Revision ID: 0009_market_embedding_gateway
Revises: 0008_resource_task_path_node
Create Date: 2026-05-27 10:00:00
"""
from alembic import op


revision = "0009_market_embedding_gateway"
down_revision = "0008_resource_task_path_node"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS provider_type VARCHAR(32) DEFAULT 'both'")
    op.execute("ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS embedding_dimension INTEGER")
    op.execute("ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS max_batch_size INTEGER DEFAULT 10")
    op.execute("ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS rate_limit_rps INTEGER")
    op.execute("ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true")
    op.execute("ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false")
    op.execute("ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS cost_config_json JSONB DEFAULT '{}'::jsonb")
    op.execute(
        """
        UPDATE model_providers
        SET provider_type = CASE
            WHEN chat_model IS NOT NULL AND embedding_model IS NOT NULL THEN 'both'
            WHEN embedding_model IS NOT NULL THEN 'embedding'
            ELSE 'chat'
        END
        WHERE provider_type IS NULL OR provider_type = 'both'
        """
    )
    op.execute(
        """
        UPDATE model_providers
        SET embedding_dimension = COALESCE(embedding_dimension, 1024)
        WHERE embedding_model IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE model_providers
        SET is_default = true
        WHERE id = (
            SELECT id FROM model_providers
            WHERE embedding_model IS NOT NULL AND COALESCE(is_active, true) = true
            ORDER BY priority ASC
            LIMIT 1
        )
        """
    )
    op.execute("ALTER TABLE model_call_logs ADD COLUMN IF NOT EXISTS capability VARCHAR(32) DEFAULT 'chat'")
    op.execute("ALTER TABLE model_call_logs ADD COLUMN IF NOT EXISTS request_count INTEGER DEFAULT 1")
    op.execute("ALTER TABLE model_call_logs ADD COLUMN IF NOT EXISTS batch_count INTEGER DEFAULT 1")
    op.execute("ALTER TABLE model_call_logs ADD COLUMN IF NOT EXISTS embedding_dim INTEGER")
    op.execute("ALTER TABLE model_call_logs ADD COLUMN IF NOT EXISTS meta_json JSONB DEFAULT '{}'::jsonb")
    op.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS model_config_json JSONB DEFAULT '{}'::jsonb")
    op.execute("CREATE INDEX IF NOT EXISTS ix_model_providers_capability_route ON model_providers (provider_type, is_active, is_default, priority)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_model_call_logs_capability_created ON model_call_logs (capability, created_at)")
    op.execute(
        """
        INSERT INTO model_providers (
            id, provider, display_name, provider_type, base_url, protocol,
            chat_model, embedding_model, embedding_dimension, max_batch_size,
            rate_limit_rps, vision_model, supports_stream, supports_tool_call,
            supports_json_mode, health_status, priority, is_active, is_default,
            cost_config_json, meta_json
        )
        VALUES (
            gen_random_uuid(), 'dashscope_embedding', '阿里云百炼 Embedding', 'embedding',
            'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding',
            'dashscope_embedding', NULL, 'text-embedding-v3', 1024, 10, NULL, NULL,
            false, false, false, 'standby', 1, true, false,
            jsonb_build_object('vendor', 'aliyun', 'billing_unit', 'token'),
            jsonb_build_object('template', true, 'market_ready', true)
        )
        ON CONFLICT (provider) DO NOTHING
        """
    )
    op.execute(
        """
        UPDATE model_providers
        SET is_default = true
        WHERE provider = (
            SELECT provider FROM model_providers
            WHERE embedding_model IS NOT NULL
              AND COALESCE(is_active, true) = true
              AND NOT EXISTS (
                  SELECT 1 FROM model_providers
                  WHERE embedding_model IS NOT NULL AND COALESCE(is_default, false) = true
              )
            ORDER BY priority ASC
            LIMIT 1
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_model_call_logs_capability_created")
    op.execute("DROP INDEX IF EXISTS ix_model_providers_capability_route")
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS model_config_json")
    op.execute("ALTER TABLE model_call_logs DROP COLUMN IF EXISTS meta_json")
    op.execute("ALTER TABLE model_call_logs DROP COLUMN IF EXISTS embedding_dim")
    op.execute("ALTER TABLE model_call_logs DROP COLUMN IF EXISTS batch_count")
    op.execute("ALTER TABLE model_call_logs DROP COLUMN IF EXISTS request_count")
    op.execute("ALTER TABLE model_call_logs DROP COLUMN IF EXISTS capability")
    op.execute("ALTER TABLE model_providers DROP COLUMN IF EXISTS cost_config_json")
    op.execute("ALTER TABLE model_providers DROP COLUMN IF EXISTS last_checked_at")
    op.execute("ALTER TABLE model_providers DROP COLUMN IF EXISTS is_default")
    op.execute("ALTER TABLE model_providers DROP COLUMN IF EXISTS is_active")
    op.execute("ALTER TABLE model_providers DROP COLUMN IF EXISTS rate_limit_rps")
    op.execute("ALTER TABLE model_providers DROP COLUMN IF EXISTS max_batch_size")
    op.execute("ALTER TABLE model_providers DROP COLUMN IF EXISTS embedding_dimension")
    op.execute("ALTER TABLE model_providers DROP COLUMN IF EXISTS provider_type")