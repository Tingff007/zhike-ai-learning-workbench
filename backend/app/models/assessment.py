import uuid
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class Assessment(Base, UUIDMixin, TimestampMixin):
    """记录一次课程测评结果及其反馈，用于驱动掌握度更新和后续学习建议。"""

    __tablename__ = "assessments"

    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    concept_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("course_concepts.id", ondelete="SET NULL"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    assessment_type: Mapped[str] = mapped_column(String(64))
    score: Mapped[int] = mapped_column(Integer, default=0)
    mastery_delta: Mapped[int] = mapped_column(Integer, default=0)
    feedback: Mapped[str] = mapped_column(Text())
    weak_reasons_json: Mapped[list[str]] = mapped_column(JSONB, default=list)
    recommended_actions_json: Mapped[list[str]] = mapped_column(JSONB, default=list)
    rubric_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    scoring_method: Mapped[str] = mapped_column(String(64), default="heuristic_rubric")
    answer_snapshot: Mapped[str | None] = mapped_column(Text())


class AssessmentItem(Base, UUIDMixin, TimestampMixin):
    """记录测评中的单个题目、答案期望和评分结果。"""

    __tablename__ = "assessment_items"

    assessment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"), index=True)
    item_type: Mapped[str] = mapped_column(String(64))
    prompt: Mapped[str] = mapped_column(Text())
    expected_answer: Mapped[str | None] = mapped_column(Text())
    score: Mapped[int] = mapped_column(Integer, default=0)
    meta_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class WrongAnswerAnalysis(Base, UUIDMixin, TimestampMixin):
    """记录测评错因分析及可推荐的补救资源线索。"""

    __tablename__ = "wrong_answer_analysis"

    assessment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"), index=True)
    concept_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("course_concepts.id", ondelete="SET NULL"), index=True)
    reason_type: Mapped[str] = mapped_column(String(120))
    note: Mapped[str] = mapped_column(Text())
    recommended_resource_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
