"""为 AI 生成课程增加规范化知识点先修关系

Revision ID: 0007_ai_course_generation
Revises: 0006_auth_sessions
Create Date: 2026-05-27 09:30:00
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision = "0007_ai_course_generation"
down_revision = "0006_auth_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if not inspect(bind).has_table("concept_prerequisites"):
        op.create_table(
            "concept_prerequisites",
            sa.Column("course_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("concept_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("prerequisite_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("dependency_type", sa.String(length=32), nullable=False),
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["concept_id"], ["course_concepts.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["prerequisite_id"], ["course_concepts.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("concept_id", "prerequisite_id", name="uq_concept_prerequisite"),
        )
    indexes = {index["name"] for index in inspect(bind).get_indexes("concept_prerequisites")}
    if op.f("ix_concept_prerequisites_concept_id") not in indexes:
        op.create_index(op.f("ix_concept_prerequisites_concept_id"), "concept_prerequisites", ["concept_id"], unique=False)
    if op.f("ix_concept_prerequisites_course_id") not in indexes:
        op.create_index(op.f("ix_concept_prerequisites_course_id"), "concept_prerequisites", ["course_id"], unique=False)
    if op.f("ix_concept_prerequisites_prerequisite_id") not in indexes:
        op.create_index(op.f("ix_concept_prerequisites_prerequisite_id"), "concept_prerequisites", ["prerequisite_id"], unique=False)

    op.execute(
        """
        INSERT INTO concept_prerequisites (id, course_id, concept_id, prerequisite_id, dependency_type)
        SELECT gen_random_uuid(), concept.course_id, concept.id, prerequisite.id, 'strong'
        FROM course_concepts concept
        CROSS JOIN LATERAL jsonb_array_elements_text(concept.prerequisites_json) AS prereq(code)
        JOIN course_concepts prerequisite
          ON prerequisite.course_id = concept.course_id
         AND prerequisite.code = prereq.code
        ON CONFLICT (concept_id, prerequisite_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_concept_prerequisites_prerequisite_id"), table_name="concept_prerequisites")
    op.drop_index(op.f("ix_concept_prerequisites_course_id"), table_name="concept_prerequisites")
    op.drop_index(op.f("ix_concept_prerequisites_concept_id"), table_name="concept_prerequisites")
    op.drop_table("concept_prerequisites")