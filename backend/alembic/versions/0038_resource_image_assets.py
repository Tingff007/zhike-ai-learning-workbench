"""增加生成式资源图片资产

Revision ID: 0038_resource_image_assets
Revises: 0037_resource_task_orchestration
Create Date: 2026-06-06 15:10:00
"""
from alembic import op


revision = "0038_resource_image_assets"
down_revision = "0037_resource_task_orchestration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS resource_assets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
            task_id UUID REFERENCES resource_generation_tasks(id) ON DELETE CASCADE,
            course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
            created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            asset_kind VARCHAR(64) NOT NULL DEFAULT 'generated_image',
            diagram_type VARCHAR(32),
            title VARCHAR(255) NOT NULL,
            file_path VARCHAR(500),
            mime_type VARCHAR(120),
            width INTEGER,
            height INTEGER,
            provider VARCHAR(120),
            model VARCHAR(120),
            prompt TEXT,
            revised_prompt TEXT,
            source_asset_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            raw_params_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            status VARCHAR(32) NOT NULL DEFAULT 'completed',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_resource_assets_resource_id ON resource_assets (resource_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_resource_assets_task_id ON resource_assets (task_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_resource_assets_course_id ON resource_assets (course_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_resource_assets_created_by_user_id ON resource_assets (created_by_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_resource_assets_asset_kind ON resource_assets (asset_kind)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_resource_assets_diagram_type ON resource_assets (diagram_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_resource_assets_provider ON resource_assets (provider)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_resource_assets_status ON resource_assets (status)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_resource_assets_status")
    op.execute("DROP INDEX IF EXISTS ix_resource_assets_provider")
    op.execute("DROP INDEX IF EXISTS ix_resource_assets_diagram_type")
    op.execute("DROP INDEX IF EXISTS ix_resource_assets_asset_kind")
    op.execute("DROP INDEX IF EXISTS ix_resource_assets_created_by_user_id")
    op.execute("DROP INDEX IF EXISTS ix_resource_assets_course_id")
    op.execute("DROP INDEX IF EXISTS ix_resource_assets_task_id")
    op.execute("DROP INDEX IF EXISTS ix_resource_assets_resource_id")
    op.execute("DROP TABLE IF EXISTS resource_assets")