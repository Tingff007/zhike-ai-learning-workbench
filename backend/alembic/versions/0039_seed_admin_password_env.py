"""从环境变量写入种子管理员密码

Revision ID: 0039_seed_admin_password_env
Revises: 0038_resource_image_assets
Create Date: 2026-06-06 20:20:00
"""
from __future__ import annotations

import os

import sqlalchemy as sa
from alembic import op
from argon2 import PasswordHasher

_password_hasher = PasswordHasher()

revision = "0039_seed_admin_password_env"
down_revision = "0038_resource_image_assets"
branch_labels = None
depends_on = None


def _hash_password(password: str) -> str:
    """使用 Argon2id 生成可校验的管理员密码哈希。"""
    return _password_hasher.hash(password)


def upgrade() -> None:
    """当环境变量提供管理员密码时，更新种子管理员账号密码。"""
    password = os.getenv("SEED_ADMIN_PASSWORD") or os.getenv("ZHIKES_SEED_ADMIN_PASSWORD")
    if not password:
        return

    email = (os.getenv("SEED_ADMIN_EMAIL") or "admin@example.edu.cn").strip().lower()
    if not email:
        return

    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE users
            SET password_hash = :password_hash,
                status = 'active',
                updated_at = NOW()
            WHERE lower(email) = :email
              AND role_code = 'admin'
            """
        ),
        {"password_hash": _hash_password(password), "email": email},
    )


def downgrade() -> None:
    """不回滚管理员密码，避免恢复旧口令造成安全风险。"""
    return