from typing import Any, Literal

from pydantic import BaseModel, Field

PathNodeStatusValue = Literal["mastered", "learning", "review", "not_started", "needs_remedial"]


class PathPrerequisiteEdge(BaseModel):
    """学习路径节点前置依赖边。"""

    id: str
    dependency_type: str = "strong"


class PathNode(BaseModel):
    """学习路径节点响应。"""

    id: str
    course_id: str | None = None
    concept_id: str | None = None
    concept_name: str | None = None
    title: str
    status: PathNodeStatusValue
    mastery: int
    mastery_score: int | None = None
    is_remedial: bool = False
    isRemedial: bool | None = None
    is_remediation: bool | None = None
    sequence_index: int | None = None
    remediate_for_concept_id: str | None = None
    prerequisites: list[str] = Field(default_factory=list)
    prerequisite_edges: list[PathPrerequisiteEdge] = Field(default_factory=list)
    recommendation: dict[str, Any] = Field(default_factory=dict)
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    updated_at: str | None = None


class PathStatusUpdate(BaseModel):
    """学习路径节点状态更新请求。"""

    status: PathNodeStatusValue


class LearningPathResponse(BaseModel):
    """学习路径列表响应。"""

    course_id: str
    items: list[PathNode]


class LearningPathGenerateResponse(LearningPathResponse):
    """学习路径生成响应。"""

    status: str


class PathNodeStatusResponse(BaseModel):
    """学习路径节点状态更新响应。"""

    node_id: str
    status: PathNodeStatusValue
    mastery_score: int | None = None


class PathNodeMasteryResponse(BaseModel):
    """单个学习路径节点掌握度响应。"""

    node_id: str
    course_id: str | None = None
    concept_id: str | None = None
    title: str
    status: PathNodeStatusValue
    mastery: int
    mastery_score: int
    is_remedial: bool = False
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    updated_at: str | None = None


class MasteryResponse(BaseModel):
    """课程掌握度响应。"""

    course_id: str
    overall: int
    dimensions: dict[str, int]
    overall_delta: int | None = None
    peer_percentile: int | None = None
    path_confidence: int | None = None


class CourseProfileSummaryResponse(BaseModel):
    """课程画像摘要兼容响应。"""

    course_id: str
    summary: str
    confidence: float | None = None
    dimensions: list[dict[str, Any]] = Field(default_factory=list)
