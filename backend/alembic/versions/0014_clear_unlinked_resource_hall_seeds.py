"""清理未关联的资源大厅种子数据

Revision ID: 0014_clear_resource_hall_seeds
Revises: 0013_chunk_quality_governance
Create Date: 2026-05-29 20:10:00
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "0014_clear_resource_hall_seeds"
down_revision = "0013_chunk_quality_governance"
branch_labels = None
depends_on = None


SEED_RESOURCES = [
    ("f8037e5d-8093-5c89-8c99-44df6cf595e3", "res_001"),
    ("400b9b8f-85bd-5dd0-beec-a61be0a696ad", "res_002"),
    ("9baf4c03-d502-5a1d-a0ad-8038206e2787", "res_003"),
    ("a4a1c651-aaf0-5c64-b0f7-e6b0c5a93451", "res_004"),
    ("40c4e2fa-5efb-58ef-b2e0-d1f5ce63a030", "review_bp_lecture_001"),
    ("8e3aab8c-b499-50c2-8869-84dcde2aaeda", "review_reg_quiz_001"),
    ("720efaa9-2a31-555e-8d2f-d9c9da195ea5", "review_attention_mindmap_001"),
]


def upgrade() -> None:
    conn = op.get_bind()
    for resource_id, code in SEED_RESOURCES:
        params = {"resource_id": resource_id, "code": code}
        conn.execute(
            sa.text(
                """
                DELETE FROM community_resources
                WHERE resource_id IN (
                    SELECT id FROM resources
                    WHERE id = CAST(:resource_id AS uuid) OR code = :code
                )
                """
            ),
            params,
        )
        conn.execute(
            sa.text(
                """
                DELETE FROM resource_versions
                WHERE resource_id IN (
                    SELECT id FROM resources
                    WHERE id = CAST(:resource_id AS uuid) OR code = :code
                )
                """
            ),
            params,
        )
        conn.execute(
            sa.text("DELETE FROM resources WHERE id = CAST(:resource_id AS uuid) OR code = :code"),
            params,
        )


def downgrade() -> None:
    pass