"""增加公告模块

Revision ID: 0040_announcements
Revises: 0039_seed_admin_password_env
Create Date: 2026-06-06 23:40:00
"""
from __future__ import annotations

from alembic import op


revision = "0040_announcements"
down_revision = "0039_seed_admin_password_env"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """创建公告、已读和关闭状态表，并插入初始公告。"""
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS announcements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(180) NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            body TEXT NOT NULL DEFAULT '',
            category VARCHAR(64) NOT NULL DEFAULT 'system',
            priority VARCHAR(32) NOT NULL DEFAULT 'info',
            display_type VARCHAR(32) NOT NULL DEFAULT 'list_only',
            audience_role VARCHAR(32) NOT NULL DEFAULT 'all',
            status VARCHAR(32) NOT NULL DEFAULT 'draft',
            pinned BOOLEAN NOT NULL DEFAULT false,
            dismissible BOOLEAN NOT NULL DEFAULT true,
            require_confirmation BOOLEAN NOT NULL DEFAULT false,
            auto_dismiss_seconds INTEGER,
            action_label VARCHAR(80),
            action_url VARCHAR(500),
            effective_at TIMESTAMP WITH TIME ZONE,
            expires_at TIMESTAMP WITH TIME ZONE,
            created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            deleted_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS announcement_reads (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            confirmed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            CONSTRAINT uq_announcement_read_user UNIQUE (announcement_id, user_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS announcement_dismissals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            display_type VARCHAR(32) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            CONSTRAINT uq_announcement_dismissal_display UNIQUE (announcement_id, user_id, display_type)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_title ON announcements (title)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_category ON announcements (category)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_priority ON announcements (priority)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_display_type ON announcements (display_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_audience_role ON announcements (audience_role)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_status ON announcements (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_pinned ON announcements (pinned)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_effective_at ON announcements (effective_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_expires_at ON announcements (expires_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_deleted_at ON announcements (deleted_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcement_reads_announcement_id ON announcement_reads (announcement_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcement_reads_user_id ON announcement_reads (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcement_dismissals_announcement_id ON announcement_dismissals (announcement_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcement_dismissals_user_id ON announcement_dismissals (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcement_dismissals_display_type ON announcement_dismissals (display_type)")
    op.execute(
        """
        INSERT INTO announcements (
            id, title, summary, body, category, priority, display_type, audience_role, status,
            pinned, dismissible, require_confirmation, action_label, action_url, effective_at
        )
        VALUES
        (
            gen_random_uuid(),
            '系统维护通知',
            '系统将于 2026 年 6 月 8 日 02:00 至 04:00 维护，部分功能可能短暂不可用。',
            '## 系统维护通知\n\n发生什么：平台将进行数据库与向量检索服务维护。\n\n影响谁：所有正在使用课程知识库、资源生成和后台管理的用户。\n\n影响时间：2026 年 6 月 8 日 02:00 至 04:00（Asia/Shanghai）。\n\n用户需要做什么：请提前保存正在编辑的资源、课程大纲和公告草稿。',
            'maintenance',
            'maintenance',
            'top_bar',
            'all',
            'published',
            true,
            true,
            false,
            '查看详情',
            '/announcements',
            NOW()
        ),
        (
            gen_random_uuid(),
            '资源生成引用规范更新',
            '课程资料生成结果将更严格标注引用来源，便于教师审核和学生复查。',
            '## 资源生成引用规范更新\n\n发生什么：资源工坊会优先使用可追溯引用，并在生成结果中突出来源页码。\n\n影响谁：使用课程资料生成讲义、题库、图解包的学生和管理员。\n\n用户需要做什么：生成资料后请检查引用卡片，必要时在资源审核中补充说明。',
            'resource',
            'info',
            'page_card',
            'all',
            'published',
            false,
            true,
            false,
            '查看公告',
            '/announcements',
            NOW()
        ),
        (
            gen_random_uuid(),
            '管理员公告后台已启用',
            '管理员现在可以在公告后台发布顶部条、弹窗、卡片和 Toast 公告。',
            '## 管理员公告后台已启用\n\n发生什么：公告模块支持分受众、分优先级、分展示方式发布。\n\n影响谁：平台管理员。\n\n用户需要做什么：进入管理员模式，在公告后台创建、编辑和发布公告。',
            'admin',
            'success',
            'toast',
            'admin',
            'published',
            false,
            true,
            false,
            '去管理',
            '/admin/announcements',
            NOW()
        )
        """
    )


def downgrade() -> None:
    """删除公告模块表。"""
    op.execute("DROP INDEX IF EXISTS ix_announcement_dismissals_display_type")
    op.execute("DROP INDEX IF EXISTS ix_announcement_dismissals_user_id")
    op.execute("DROP INDEX IF EXISTS ix_announcement_dismissals_announcement_id")
    op.execute("DROP INDEX IF EXISTS ix_announcement_reads_user_id")
    op.execute("DROP INDEX IF EXISTS ix_announcement_reads_announcement_id")
    op.execute("DROP INDEX IF EXISTS ix_announcements_deleted_at")
    op.execute("DROP INDEX IF EXISTS ix_announcements_expires_at")
    op.execute("DROP INDEX IF EXISTS ix_announcements_effective_at")
    op.execute("DROP INDEX IF EXISTS ix_announcements_pinned")
    op.execute("DROP INDEX IF EXISTS ix_announcements_status")
    op.execute("DROP INDEX IF EXISTS ix_announcements_audience_role")
    op.execute("DROP INDEX IF EXISTS ix_announcements_display_type")
    op.execute("DROP INDEX IF EXISTS ix_announcements_priority")
    op.execute("DROP INDEX IF EXISTS ix_announcements_category")
    op.execute("DROP INDEX IF EXISTS ix_announcements_title")
    op.execute("DROP TABLE IF EXISTS announcement_dismissals")
    op.execute("DROP TABLE IF EXISTS announcement_reads")
    op.execute("DROP TABLE IF EXISTS announcements")