"""增加登录背景站点设置

Revision ID: 0041_site_settings
Revises: 0040_announcements
Create Date: 2026-06-07 03:10:00
"""
from __future__ import annotations

from alembic import op


revision = "0041_site_settings"
down_revision = "0040_announcements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """创建站点级配置表，并写入登录页背景默认配置。"""
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS site_settings (
            key VARCHAR(120) PRIMARY KEY,
            value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_by VARCHAR(120),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_site_settings_updated_by ON site_settings (updated_by)")
    op.execute(
        """
        INSERT INTO site_settings (key, value_json)
        VALUES (
            'login_background',
            '{
              "enabled": true,
              "media_type": "video",
              "media_url": "/auth/login-hero.mp4",
              "fit": "cover",
              "position_x": 50,
              "position_y": 50,
              "scale": 1.02,
              "brightness": 0.96,
              "contrast": 1.08,
              "saturate": 1.08,
              "blur": 0,
              "overlay_opacity": 0.46,
              "fallback_color": "#b7d8ea"
            }'::jsonb
        )
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    """删除站点级配置表。"""
    op.execute("DROP INDEX IF EXISTS ix_site_settings_updated_by")
    op.execute("DROP TABLE IF EXISTS site_settings")