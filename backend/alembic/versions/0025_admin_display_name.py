"""规范化演示管理员用户展示名称

Revision ID: 0025_admin_display_name
Revises: 0024_rag_integration_config
Create Date: 2026-06-03 12:00:00
"""

from alembic import op


revision = "0025_admin_display_name"
down_revision = "0024_rag_integration_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE users
        SET display_name = '管理员',
            email = CASE WHEN email = 'teacher@example.edu.cn' THEN 'admin@example.edu.cn' ELSE email END,
            updated_at = NOW()
        WHERE role_code = 'admin'
          AND (display_name IN ('张老师', '平台管理员') OR email = 'teacher@example.edu.cn')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE users
        SET display_name = '张老师',
            email = CASE WHEN email = 'admin@example.edu.cn' THEN 'teacher@example.edu.cn' ELSE email END,
            updated_at = NOW()
        WHERE role_code = 'admin'
          AND display_name = '管理员'
          AND email = 'admin@example.edu.cn'
        """
    )