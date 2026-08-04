"""为邮箱登录增加密码哈希字段

Revision ID: 0006_auth_sessions
Revises: 0005_operations_monitoring_demo
Create Date: 2026-05-26 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0006_auth_sessions"
down_revision = "0005_operations_monitoring_demo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in inspect(bind).get_columns("users")}
    if "password_hash" not in columns:
        op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))
    op.execute(
        """
        UPDATE users
        SET password_hash = 'sha256$zhang_seed_salt$879fd57324e967a8888f110f3d08923803194321f29ec8a463563c4072772955'
        WHERE email = 'zhang@example.edu.cn' AND password_hash IS NULL
        """
    )
    op.execute(
        """
        UPDATE users
        SET password_hash = 'sha256$teacher_seed_salt$480c219d3468ccb4d0f300aa7c95a7451bd1c4ca2f639fed6620079d29a0ee4a'
        WHERE email = 'admin@example.edu.cn' AND password_hash IS NULL
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in inspect(bind).get_columns("users")}
    if "password_hash" in columns:
        op.drop_column("users", "password_hash")