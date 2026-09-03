"""扩展学习画像范围和证据字段

Revision ID: 0036_learning_profile_scopes
Revises: 0035_general_resource_tasks
"""

from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0036_learning_profile_scopes"
down_revision = "0035_general_resource_tasks"
branch_labels = None
depends_on = None


def _add_constraint_if_missing(name: str, table: str, ddl: str) -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = '{name}' AND conrelid = '{table}'::regclass
            ) THEN
                ALTER TABLE {table} ADD CONSTRAINT {name} {ddl};
            END IF;
        END $$;
        """
    )


def upgrade() -> None:
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY user_id
                       ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
                   ) AS rn
            FROM user_profiles
        )
        DELETE FROM user_profiles
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        """
    )
    _add_constraint_if_missing("uq_user_profile_user", "user_profiles", "UNIQUE (user_id)")

    op.execute("ALTER TABLE profile_dimensions ADD COLUMN IF NOT EXISTS user_profile_id UUID")
    op.execute("ALTER TABLE profile_dimensions ADD COLUMN IF NOT EXISTS profile_scope VARCHAR(32) NOT NULL DEFAULT 'course'")
    op.execute("ALTER TABLE profile_dimensions ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active'")
    op.alter_column("profile_dimensions", "profile_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    _add_constraint_if_missing(
        "fk_profile_dimensions_user_profile_id_user_profiles",
        "profile_dimensions",
        "FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE",
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_profile_dimensions_user_profile_id ON profile_dimensions (user_profile_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_profile_dimensions_profile_scope ON profile_dimensions (profile_scope)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_profile_dimensions_status ON profile_dimensions (status)")
    _add_constraint_if_missing(
        "uq_user_profile_dimension_scope",
        "profile_dimensions",
        "UNIQUE (user_profile_id, profile_scope, dimension_key)",
    )

    op.execute("ALTER TABLE profile_evidence ADD COLUMN IF NOT EXISTS user_profile_id UUID")
    op.execute("ALTER TABLE profile_evidence ADD COLUMN IF NOT EXISTS user_id UUID")
    op.execute("ALTER TABLE profile_evidence ADD COLUMN IF NOT EXISTS course_id UUID")
    op.execute("ALTER TABLE profile_evidence ADD COLUMN IF NOT EXISTS conversation_id UUID")
    op.execute("ALTER TABLE profile_evidence ADD COLUMN IF NOT EXISTS scope VARCHAR(32) NOT NULL DEFAULT 'course'")
    op.execute("ALTER TABLE profile_evidence ADD COLUMN IF NOT EXISTS label VARCHAR(120)")
    op.execute("ALTER TABLE profile_evidence ADD COLUMN IF NOT EXISTS confidence_delta DOUBLE PRECISION NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE profile_evidence ADD COLUMN IF NOT EXISTS summary TEXT")
    op.execute("ALTER TABLE profile_evidence ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active'")
    op.alter_column("profile_evidence", "profile_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    _add_constraint_if_missing(
        "fk_profile_evidence_user_profile_id_user_profiles",
        "profile_evidence",
        "FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE",
    )
    _add_constraint_if_missing("fk_profile_evidence_user_id_users", "profile_evidence", "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL")
    _add_constraint_if_missing("fk_profile_evidence_course_id_courses", "profile_evidence", "FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE")
    _add_constraint_if_missing(
        "fk_profile_evidence_conversation_id_conversations",
        "profile_evidence",
        "FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL",
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_profile_evidence_user_profile_id ON profile_evidence (user_profile_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_profile_evidence_user_id ON profile_evidence (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_profile_evidence_course_id ON profile_evidence (course_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_profile_evidence_conversation_id ON profile_evidence (conversation_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_profile_evidence_scope ON profile_evidence (scope)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_profile_evidence_status ON profile_evidence (status)")

    op.execute(
        """
        UPDATE profile_evidence AS pe
        SET user_id = cp.user_id,
            course_id = cp.course_id,
            scope = 'course'
        FROM course_profiles AS cp
        WHERE pe.profile_id = cp.id
        """
    )
    op.execute(
        """
        UPDATE profile_evidence AS pe
        SET label = pd.label,
            summary = COALESCE(pe.note, pd.label),
            confidence_delta = COALESCE(pe.confidence, 0)
        FROM profile_dimensions AS pd
        WHERE pe.profile_id = pd.profile_id
          AND pe.dimension_key = pd.dimension_key
        """
    )
    op.execute("UPDATE profile_evidence SET summary = note WHERE summary IS NULL")


def downgrade() -> None:
    op.drop_index("ix_profile_evidence_status", table_name="profile_evidence")
    op.drop_index("ix_profile_evidence_scope", table_name="profile_evidence")
    op.drop_index("ix_profile_evidence_conversation_id", table_name="profile_evidence")
    op.drop_index("ix_profile_evidence_course_id", table_name="profile_evidence")
    op.drop_index("ix_profile_evidence_user_id", table_name="profile_evidence")
    op.drop_index("ix_profile_evidence_user_profile_id", table_name="profile_evidence")
    op.drop_constraint("fk_profile_evidence_conversation_id_conversations", "profile_evidence", type_="foreignkey")
    op.drop_constraint("fk_profile_evidence_course_id_courses", "profile_evidence", type_="foreignkey")
    op.drop_constraint("fk_profile_evidence_user_id_users", "profile_evidence", type_="foreignkey")
    op.drop_constraint("fk_profile_evidence_user_profile_id_user_profiles", "profile_evidence", type_="foreignkey")
    op.alter_column("profile_evidence", "profile_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.drop_column("profile_evidence", "status")
    op.drop_column("profile_evidence", "summary")
    op.drop_column("profile_evidence", "confidence_delta")
    op.drop_column("profile_evidence", "label")
    op.drop_column("profile_evidence", "scope")
    op.drop_column("profile_evidence", "conversation_id")
    op.drop_column("profile_evidence", "course_id")
    op.drop_column("profile_evidence", "user_id")
    op.drop_column("profile_evidence", "user_profile_id")

    op.drop_constraint("uq_user_profile_dimension_scope", "profile_dimensions", type_="unique")
    op.drop_index("ix_profile_dimensions_status", table_name="profile_dimensions")
    op.drop_index("ix_profile_dimensions_profile_scope", table_name="profile_dimensions")
    op.drop_index("ix_profile_dimensions_user_profile_id", table_name="profile_dimensions")
    op.drop_constraint("fk_profile_dimensions_user_profile_id_user_profiles", "profile_dimensions", type_="foreignkey")
    op.alter_column("profile_dimensions", "profile_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.drop_column("profile_dimensions", "status")
    op.drop_column("profile_dimensions", "profile_scope")
    op.drop_column("profile_dimensions", "user_profile_id")

    op.drop_constraint("uq_user_profile_user", "user_profiles", type_="unique")