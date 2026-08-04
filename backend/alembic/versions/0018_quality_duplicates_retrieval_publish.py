"""增加质量、重复检测、检索和发布控制字段

Revision ID: 0018_quality_retrieval
Revises: 0017_prod_tasks
Create Date: 2026-05-30 18:00:00
"""
from alembic import op


revision = "0018_quality_retrieval"
down_revision = "0017_prod_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS quality_rule_version VARCHAR(64) NOT NULL DEFAULT 'quality-v1'")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_quality_rule_version ON document_chunks (quality_rule_version)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chunk_duplicate_candidates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
            candidate_document_id UUID NULL REFERENCES documents(id) ON DELETE CASCADE,
            candidate_chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
            score DOUBLE PRECISION NOT NULL DEFAULT 0,
            method VARCHAR(32) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            reason_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            reviewed_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
            reviewed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT uq_chunk_duplicate_candidate_method UNIQUE (chunk_id, candidate_chunk_id, method)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_duplicate_candidates_course_id ON chunk_duplicate_candidates (course_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_duplicate_candidates_document_id ON chunk_duplicate_candidates (document_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_duplicate_candidates_chunk_id ON chunk_duplicate_candidates (chunk_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_duplicate_candidates_candidate_document_id ON chunk_duplicate_candidates (candidate_document_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_duplicate_candidates_candidate_chunk_id ON chunk_duplicate_candidates (candidate_chunk_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_duplicate_candidates_method ON chunk_duplicate_candidates (method)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_duplicate_candidates_status ON chunk_duplicate_candidates (status)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chunk_quality_feedback (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            chunk_id UUID NULL REFERENCES document_chunks(id) ON DELETE SET NULL,
            actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
            action VARCHAR(64) NOT NULL,
            rule_code VARCHAR(120),
            quality_rule_version VARCHAR(64),
            note TEXT,
            before_score DOUBLE PRECISION,
            after_score DOUBLE PRECISION,
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_quality_feedback_document_id ON chunk_quality_feedback (document_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_quality_feedback_chunk_id ON chunk_quality_feedback (chunk_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_quality_feedback_actor_user_id ON chunk_quality_feedback (actor_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_quality_feedback_action ON chunk_quality_feedback (action)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_quality_feedback_rule_code ON chunk_quality_feedback (rule_code)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunk_quality_feedback_quality_rule_version ON chunk_quality_feedback (quality_rule_version)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS retrieval_verification_questions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            question TEXT NOT NULL,
            expected_concept_id UUID NULL REFERENCES course_concepts(id) ON DELETE SET NULL,
            expected_heading_text VARCHAR(500),
            min_similarity DOUBLE PRECISION NOT NULL DEFAULT 0.55,
            status VARCHAR(32) NOT NULL DEFAULT 'active',
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_retrieval_verification_questions_course_id ON retrieval_verification_questions (course_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_retrieval_verification_questions_expected_concept_id ON retrieval_verification_questions (expected_concept_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_retrieval_verification_questions_expected_heading_text ON retrieval_verification_questions (expected_heading_text)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_retrieval_verification_questions_status ON retrieval_verification_questions (status)")

#     op.execute(  # disabled: no pgvector
#         """  # disabled: no pgvector
#         CREATE TABLE IF NOT EXISTS retrieval_verification_runs (  # disabled: no pgvector
#             id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  # disabled: no pgvector
#             course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,  # disabled: no pgvector
#             document_id UUID NULL REFERENCES documents(id) ON DELETE SET NULL,  # disabled: no pgvector
#             vectorization_task_id UUID NULL REFERENCES vectorization_tasks(id) ON DELETE SET NULL,  # disabled: no pgvector
#             generation_id VARCHAR(64),  # disabled: no pgvector
#             status VARCHAR(32) NOT NULL DEFAULT 'queued',  # disabled: no pgvector
#             stage VARCHAR(64) NOT NULL DEFAULT 'queued',  # disabled: no pgvector
#             started_at TIMESTAMP WITH TIME ZONE,  # disabled: no pgvector
#             finished_at TIMESTAMP WITH TIME ZONE,  # disabled: no pgvector
#             locked_at TIMESTAMP WITH TIME ZONE,  # disabled: no pgvector
#             heartbeat_at TIMESTAMP WITH TIME ZONE,  # disabled: no pgvector
#             worker_id VARCHAR(120),  # disabled: no pgvector
#             trace_id VARCHAR(120),  # disabled: no pgvector
#             attempt_count INTEGER NOT NULL DEFAULT 0,  # disabled: no pgvector
#             max_attempts INTEGER NOT NULL DEFAULT 3,  # disabled: no pgvector
#             next_retry_at TIMESTAMP WITH TIME ZONE,  # disabled: no pgvector
#             timeout_seconds INTEGER NOT NULL DEFAULT 900,  # disabled: no pgvector
#             total_questions INTEGER NOT NULL DEFAULT 0,  # disabled: no pgvector
#             passed_questions INTEGER NOT NULL DEFAULT 0,  # disabled: no pgvector
#             top_k_hit_rate DOUBLE PRECISION NOT NULL DEFAULT 0,  # disabled: no pgvector
#             citation_coverage DOUBLE PRECISION NOT NULL DEFAULT 0,  # disabled: no pgvector
#             low_confidence_rate DOUBLE PRECISION NOT NULL DEFAULT 0,  # disabled: no pgvector
#             avg_top_score DOUBLE PRECISION NOT NULL DEFAULT 0,  # disabled: no pgvector
#             error_summary TEXT,  # disabled: no pgvector
#             result_json JSONB NOT NULL DEFAULT '{}'::jsonb,  # disabled: no pgvector
#             created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),  # disabled: no pgvector
#             updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()  # disabled: no pgvector
#         )  # disabled: no pgvector
#         """  # disabled: no pgvector
#     )  # disabled: no pgvector
    op.execute("CREATE INDEX IF NOT EXISTS ix_retrieval_verification_runs_course_id ON retrieval_verification_runs (course_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_retrieval_verification_runs_document_id ON retrieval_verification_runs (document_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_retrieval_verification_runs_vectorization_task_id ON retrieval_verification_runs (vectorization_task_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_retrieval_verification_runs_generation_id ON retrieval_verification_runs (generation_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_retrieval_verification_runs_status ON retrieval_verification_runs (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_retrieval_verification_runs_stage ON retrieval_verification_runs (stage)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_retrieval_verification_runs_worker_id ON retrieval_verification_runs (worker_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_retrieval_verification_runs_trace_id ON retrieval_verification_runs (trace_id)")

#     op.execute(  # disabled: no pgvector
#         """  # disabled: no pgvector
#         CREATE TABLE IF NOT EXISTS knowledge_publish_generations (  # disabled: no pgvector
#             id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  # disabled: no pgvector
#             course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,  # disabled: no pgvector
#             generation_id VARCHAR(64) NOT NULL,  # disabled: no pgvector
#             previous_generation_id VARCHAR(64),  # disabled: no pgvector
#             status VARCHAR(32) NOT NULL DEFAULT 'candidate',  # disabled: no pgvector
#             vectorization_task_id UUID NULL REFERENCES vectorization_tasks(id) ON DELETE SET NULL,  # disabled: no pgvector
#             verification_run_id UUID NULL REFERENCES retrieval_verification_runs(id) ON DELETE SET NULL,  # disabled: no pgvector
#             published_at TIMESTAMP WITH TIME ZONE,  # disabled: no pgvector
#             rolled_back_at TIMESTAMP WITH TIME ZONE,  # disabled: no pgvector
#             metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,  # disabled: no pgvector
#             created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),  # disabled: no pgvector
#             updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),  # disabled: no pgvector
#             CONSTRAINT uq_course_publish_generation UNIQUE (course_id, generation_id)  # disabled: no pgvector
#         )  # disabled: no pgvector
#         """  # disabled: no pgvector
#     )  # disabled: no pgvector
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_publish_generations_course_id ON knowledge_publish_generations (course_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_publish_generations_generation_id ON knowledge_publish_generations (generation_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_publish_generations_previous_generation_id ON knowledge_publish_generations (previous_generation_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_publish_generations_status ON knowledge_publish_generations (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_publish_generations_vectorization_task_id ON knowledge_publish_generations (vectorization_task_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_publish_generations_verification_run_id ON knowledge_publish_generations (verification_run_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS knowledge_publish_generations")
    op.execute("DROP TABLE IF EXISTS retrieval_verification_runs")
    op.execute("DROP TABLE IF EXISTS retrieval_verification_questions")
    op.execute("DROP TABLE IF EXISTS chunk_quality_feedback")
    op.execute("DROP TABLE IF EXISTS chunk_duplicate_candidates")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_quality_rule_version")
    op.execute("ALTER TABLE document_chunks DROP COLUMN IF EXISTS quality_rule_version")