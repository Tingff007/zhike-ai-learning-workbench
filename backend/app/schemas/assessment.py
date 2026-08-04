from datetime import datetime
from pydantic import BaseModel, Field, model_validator


class AssessmentSubmitRequest(BaseModel):
    """学习测评提交请求，兼容新版 answer 和旧版 answer_text 字段。"""

    course_id: str
    concept_id: str
    path_node_id: str | None = None
    assessment_type: str = "code_lab"
    answer: str = ""
    answer_text: str | None = None
    duration_seconds: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def normalize_answer(self) -> "AssessmentSubmitRequest":
        """把旧字段 answer_text 归一到 answer，避免路由层重复兼容逻辑。"""

        if not self.answer and self.answer_text:
            self.answer = self.answer_text
        return self


class AssessmentDraftRequest(BaseModel):
    """阶段测评题草稿生成请求。"""

    course_id: str
    concept_id: str
    path_node_id: str | None = None
    difficulty: str = "medium"
    requirements: str | None = None


class AssessmentDraftResponse(BaseModel):
    """阶段测评题草稿响应，content 为可作答 Markdown。"""

    title: str
    content: str
    course_id: str
    concept_id: str
    path_node_id: str | None = None
    source: str = "ai_structured_quiz"


class AssessmentResult(BaseModel):
    """测评完成后的评分、反馈、薄弱点和后续行动响应。"""

    id: str
    score: int
    mastery_delta: int
    feedback: str
    weak_reasons: list[str]
    recommended_actions: list[str]
    rubric: list[dict] = Field(default_factory=list)
    scoring_method: str = "heuristic_rubric"
    progress_report: str | None = None


class AssessmentQueuedResponse(BaseModel):
    """异步测评任务已入队后的前端轮询响应。"""

    status: str = "processing"
    task_id: str
    submitted_at: datetime
