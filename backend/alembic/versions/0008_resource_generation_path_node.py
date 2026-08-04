"""关联资源生成任务与学习路径节点

Revision ID: 0008_resource_task_path_node
Revises: 0007_ai_course_generation
Create Date: 2026-05-27 09:45:00
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision = "0008_resource_task_path_node"
down_revision = "0007_ai_course_generation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in inspect(bind).get_columns("resource_generation_tasks")}
    if "path_node_id" not in columns:
        op.add_column("resource_generation_tasks", sa.Column("path_node_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            "fk_resource_generation_tasks_path_node_id_path_nodes",
            "resource_generation_tasks",
            "path_nodes",
            ["path_node_id"],
            ["id"],
            ondelete="SET NULL",
        )
    indexes = {index["name"] for index in inspect(bind).get_indexes("resource_generation_tasks")}
    if op.f("ix_resource_generation_tasks_path_node_id") not in indexes:
        op.create_index(op.f("ix_resource_generation_tasks_path_node_id"), "resource_generation_tasks", ["path_node_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    indexes = {index["name"] for index in inspect(bind).get_indexes("resource_generation_tasks")}
    if op.f("ix_resource_generation_tasks_path_node_id") in indexes:
        op.drop_index(op.f("ix_resource_generation_tasks_path_node_id"), table_name="resource_generation_tasks")
    columns = {column["name"] for column in inspect(bind).get_columns("resource_generation_tasks")}
    if "path_node_id" in columns:
        op.drop_constraint("fk_resource_generation_tasks_path_node_id_path_nodes", "resource_generation_tasks", type_="foreignkey")
        op.drop_column("resource_generation_tasks", "path_node_id")