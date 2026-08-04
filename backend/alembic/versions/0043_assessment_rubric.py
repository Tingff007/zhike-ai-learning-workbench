"""新增评估 Rubric 结果字段

Revision ID: 0043_assessment_rubric
Revises: 0042_learning_schedule_items
Create Date: 2026-06-07 09:35:00
"""
from __future__ import annotations

from alembic import op


revision = "0043_assessment_rubric"
down_revision = "0042_learning_schedule_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """为评估结果增加 Rubric 分项评分字段。"""
    op.execute("ALTER TABLE assessments ADD COLUMN IF NOT EXISTS rubric_json JSONB NOT NULL DEFAULT '{}'::jsonb")
    op.execute("ALTER TABLE assessments ADD COLUMN IF NOT EXISTS scoring_method VARCHAR(64) NOT NULL DEFAULT 'heuristic_rubric'")


def downgrade() -> None:
    """移除评估 Rubric 字段。"""
    op.execute("ALTER TABLE assessments DROP COLUMN IF EXISTS scoring_method")
    op.execute("ALTER TABLE assessments DROP COLUMN IF EXISTS rubric_json")