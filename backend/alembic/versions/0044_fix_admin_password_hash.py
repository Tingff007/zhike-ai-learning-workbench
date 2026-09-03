"""直接为管理员账号设置 Argon2id 密码哈希

此 migration 不依赖环境变量，直接使用硬编码的 Argon2id 哈希替换 admin
账号的旧 SHA256 密码。在 .env 中设置 SEED_ADMIN_PASSWORD 并重跑
0039 无效（因已标记为完成），因此用此脚本一次性修复。

Revision ID: 0044_fix_admin_password_hash
Revises: 0043_assessment_rubric
Create Date: 2026-06-24 22:00:00
"""
from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op
from argon2 import PasswordHasher

_password_hasher = PasswordHasher()

revision = "0044_fix_admin_password_hash"
down_revision = "0043_assessment_rubric"
branch_labels = None
depends_on = None


ADMIN_EMAIL = "admin@example.edu.cn"


def upgrade() -> None:
    """用 Argon2id 重写管理员密码哈希。"""
    bind = op.get_bind()

    admin = bind.execute(
        sa.text("SELECT id FROM users WHERE email = :email AND role_code = 'admin'"),
        {"email": ADMIN_EMAIL},
    ).fetchone()

    if not admin:
        bind.execute(
            sa.text(
                """INSERT INTO users (id, external_id, display_name, email, password_hash, role_code, status, created_at, updated_at)
VALUES (:id, :eid, :name, :email, :hash, 'admin', 'active', NOW(), NOW())"""
            ),
            {
                "id": uuid.uuid4(),
                "eid": f"admin_{uuid.uuid4().hex[:16]}",
                "name": "管理员",
                "email": ADMIN_EMAIL,
                "hash": _password_hasher.hash("admin123"),
            },
        )
    else:
        bind.execute(
            sa.text(
                "UPDATE users SET password_hash = :hash, status = 'active', updated_at = NOW() WHERE email = :email"
            ),
            {"hash": _password_hasher.hash("admin123"), "email": ADMIN_EMAIL},
        )


def downgrade() -> None:
    """不回滚密码哈希，避免恢复旧 SHA256 造成安全隐患。"""
    pass