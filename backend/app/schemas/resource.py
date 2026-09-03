from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.schemas.common import Citation


class ResourceGenerateRequest(BaseModel):
    """资源生成任务创建请求。

    该契约同时兼容前端历史 camelCase 字段和后端 snake_case 字段，路由层只接收校验后的统一字段。
    """

    model_config = ConfigDict(populate_by_name=True)

    scope: Literal["course", "general"] = "course"
    course_id: str | None = None
    concept_id: str | None = None
    path_node_id: str | None = None
    resource_type: str
    difficulty: str = "basic"
    goal: str
    requirements: str | None = None
    topic: str | None = None
    need_course_evidence: bool = False
    action_type: str | None = None
    client_context: dict | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_frontend_aliases(cls, data: object) -> object:
        """归一化前端历史别名，避免路由或服务层重复处理兼容字段。"""
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        if "needCourseEvidence" in normalized and "need_course_evidence" not in normalized:
            normalized["need_course_evidence"] = normalized["needCourseEvidence"]
        if "actionType" in normalized and "action_type" not in normalized:
            normalized["action_type"] = normalized["actionType"]
        if "clientContext" in normalized and "client_context" not in normalized:
            normalized["client_context"] = normalized["clientContext"]
        return normalized


class ResourceGenerationStep(BaseModel):
    """资源生成流程中的单个阶段状态。"""

    name: str
    status: str = "queued"
    detail: str | None = None
    phase: str | None = None
    citations: list[Citation] = Field(default_factory=list)


class OutlineSection(BaseModel):
    """资源草稿大纲中的结构化章节。"""

    id: str
    level: int = 2
    title: str
    order: int = 0


class ResourceAsset(BaseModel):
    """资源生成或上传过程中产生的图片、图解等可复用资产。"""

    id: str
    diagram_type: str | None = None
    title: str
    file_url: str | None = None
    width: int | None = None
    height: int | None = None
    mime_type: str | None = None
    prompt: str | None = None
    revised_prompt: str | None = None
    provider: str | None = None
    model: str | None = None
    status: str = "completed"
    raw_params: dict = Field(default_factory=dict)


class ResourceGenerationTask(BaseModel):
    """资源生成任务详情响应。

    包含任务进度、Agent 编排状态、草稿正文、引用证据和生成资产，用于前端任务卡片和编辑工作台同步。
    """

    task_id: str
    status: str
    course_id: str | None = None
    scope: str = "course"
    resource_type: str
    resource_type_label: str | None = None
    difficulty: str = "basic"
    progress: int = 0
    steps: list[ResourceGenerationStep | str] = Field(default_factory=list)
    draft_content: str | None = None
    outline_json: list[OutlineSection] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    need_course_evidence: bool = False
    course_evidence_required: bool = False
    current_agent: str | None = None
    citation_coverage: str | None = None
    result_resource_id: str | None = None
    result_resource_code: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    error_root_cause: str | None = None
    message: str | None = None
    orchestration: dict = Field(default_factory=dict)
    assets: list[ResourceAsset] = Field(default_factory=list)


class ResourceGenerationTaskNotFound(BaseModel):
    """资源生成任务不存在的兼容响应。"""

    task_id: str
    status: Literal["not_found"] = "not_found"


class ResourceGenerationTaskListItem(BaseModel):
    """资源生成任务列表项，兼容历史紧凑字段。"""

    model_config = ConfigDict(extra="allow")

    task_id: str
    status: str
    resource_type: str | None = None


class ResourceGenerationTaskListResponse(BaseModel):
    """资源生成任务列表响应。"""

    items: list[ResourceGenerationTaskListItem] = Field(default_factory=list)


class ResourceTaskRerunRequest(BaseModel):
    """重新运行资源生成任务的请求参数。"""

    need_course_evidence: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_frontend_aliases(cls, data: object) -> object:
        """兼容前端历史 camelCase 字段。"""
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        if "needCourseEvidence" in normalized and "need_course_evidence" not in normalized:
            normalized["need_course_evidence"] = normalized["needCourseEvidence"]
        return normalized


class ResourceTaskOutlineUpdate(BaseModel):
    """更新资源生成任务大纲的请求。"""

    sections: list[OutlineSection]


class ResourceVersion(BaseModel):
    """资源正文历史版本。"""

    id: str
    version: int
    content: str
    meta: dict = Field(default_factory=dict)
    created_at: str | None = None


class ResourceVersionListResponse(BaseModel):
    """资源版本列表响应。"""

    resource_id: str
    items: list[ResourceVersion] = Field(default_factory=list)


class ResourceUpdateRequest(BaseModel):
    """资源基础信息和正文更新请求。"""

    title: str | None = None
    summary: str | None = None
    content: str | None = None
    status: str | None = None
    difficulty: str | None = None


class ResourceArchiveCourseRequest(BaseModel):
    """将通用资源归档绑定到课程的请求。"""

    course_id: str
    concept_id: str | None = None
    path_node_id: str | None = None


class ResourceBatchDeleteRequest(BaseModel):
    """批量删除资源请求。"""

    resource_ids: list[str] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def normalize_resource_ids(self) -> "ResourceBatchDeleteRequest":
        """清理空 ID 并按提交顺序去重。"""
        seen: set[str] = set()
        normalized: list[str] = []
        for resource_id in self.resource_ids:
            value = str(resource_id).strip()
            if not value or value in seen:
                continue
            seen.add(value)
            normalized.append(value)
        if not normalized:
            raise ValueError("resource_ids must not be empty")
        self.resource_ids = normalized
        return self


class ResourceDeleteResult(BaseModel):
    """单个资源删除成功结果。"""

    resource_id: str
    status: str
    deleted_at: str | None = None


class ResourceNotFoundResponse(BaseModel):
    """资源不存在的兼容响应。"""

    id: str | None = None
    resource_id: str | None = None
    status: Literal["not_found"] = "not_found"


class ResourceBatchDeleteRejectedItem(BaseModel):
    """批量删除中未能删除的资源。"""

    resource_id: str
    reason: str


class ResourceBatchDeleteResponse(BaseModel):
    """批量删除资源返回结果。"""

    status: str = "ok"
    deleted: list[ResourceDeleteResult] = Field(default_factory=list)
    rejected: list[ResourceBatchDeleteRejectedItem] = Field(default_factory=list)
    deleted_count: int = 0
    rejected_count: int = 0


class ResourceReviewRequest(BaseModel):
    """资源审核动作请求。"""

    action: str = Field(description="审核动作：approve、feature、request_changes、reject、hide、archive")
    comment: str | None = None
    quality_score: int | None = None
    quality_grade: str | None = None
    title: str | None = None
    summary: str | None = None
    difficulty: str | None = None
    tags: list[str] = Field(default_factory=list)


class ResourceReviewStats(BaseModel):
    """资源审核统计响应。"""

    pending_review: int = 0
    changes_requested: int = 0
    approved_today: int = 0
    featured: int = 0
    citation_missing: int = 0
    safety_blocked: int = 0


class ResourceReviewItem(BaseModel):
    """资源审核队列和详情项，允许保留资源序列化中的扩展字段。"""

    model_config = ConfigDict(extra="allow")


class ResourceReviewQueueResponse(BaseModel):
    """资源审核队列响应。"""

    items: list[ResourceReviewItem]


class ResourceReviewLogItem(BaseModel):
    """资源审核日志列表项。"""

    id: str
    resource_id: str
    resource_uuid: str | None = None
    title: str
    action: str
    note: str | None = None
    reviewer: str | None = None
    review_status: str | None = None
    resource_status: str | None = None
    quality_score: int | None = None
    citation_complete: bool | None = None
    safety_status: str | None = None
    created_at: str | None = None


class ResourceReviewLogListResponse(BaseModel):
    """资源审核日志列表响应。"""

    items: list[ResourceReviewLogItem]


class ResourceRecommendationEvidence(BaseModel):
    """资源推荐理由中的证据项。"""

    key: str
    label: str
    summary: str
    source: str | None = None
    score: int | None = None


class Resource(BaseModel):
    """学习资源详情。

    该模型覆盖个人资源、课程资源、社区资源和资源大厅卡片字段，允许前端在不同入口复用同一资源契约。
    """

    id: str
    course_id: str | None = None
    scope: str = "course"
    owner_scope: str | None = None
    course_bound: bool = True
    course_evidence_required: bool = False
    title: str
    resource_type: str
    difficulty: str
    status: str = "private"
    summary: str
    citations: list[Citation] = Field(default_factory=list)
    personalization: dict = Field(default_factory=dict)
    generation_basis_summary: str | None = None
    citation_coverage: str | None = None
    content: str | None = None
    latest_version: int | None = None
    view_count: int = 0
    copied_count: int = 0
    community_id: str | None = None
    review_status: str | None = None
    submitted_at: str | None = None
    reviewed_at: str | None = None
    review_comment: str | None = None
    concept_title: str | None = None
    submitted_by: str | None = None
    reviewed_by: str | None = None
    recommendation_score: float | None = None
    match_reason: str | None = None
    recommendation_evidence: list[ResourceRecommendationEvidence] = Field(default_factory=list)
    badges: list[str] = Field(default_factory=list)
    is_featured: bool = False
    is_recommended: bool = False
    assets: list[ResourceAsset] = Field(default_factory=list)
    asset_count: int = 0
    thumbnail_url: str | None = None


class ResourceListResponse(BaseModel):
    """资源列表响应。"""

    items: list[Resource] = Field(default_factory=list)


class CommunityResourceFilters(BaseModel):
    """社区资源列表筛选回显。"""

    course_id: str | None = None
    concept_id: str | None = None
    type: str | None = None
    difficulty: str | None = None


class CommunityResourceListResponse(ResourceListResponse):
    """社区资源列表响应。"""

    filters: CommunityResourceFilters


class ResourceAssetUploadItem(BaseModel):
    """参考图上传后的资产列表项，兼容历史紧凑字段。"""

    model_config = ConfigDict(extra="allow")

    id: str
    title: str | None = None
    file_url: str | None = None
    mime_type: str | None = None
    status: str = "completed"


class ResourceAssetUploadResponse(BaseModel):
    """参考图上传响应。"""

    items: list[ResourceAssetUploadItem] = Field(default_factory=list)
    count: int = 0


class ResourceCommunitySubmitResponse(BaseModel):
    """资源提交社区审核响应。"""

    resource_id: str
    status: str


class ResourceHallFilterOption(BaseModel):
    """资源大厅筛选项及命中数量。"""

    value: str
    label: str
    count: int


class ResourceHallStats(BaseModel):
    """资源大厅统计卡片数据。"""

    total: int = 0
    course: int = 0
    general: int = 0
    mine: int = 0
    community: int = 0
    recommended: int = 0
    featured: int = 0
    with_citations: int = 0
    avg_quality: int = 0
    total_views: int = 0
    total_copies: int = 0


class ResourceHallFilters(BaseModel):
    """资源大厅可用筛选条件集合。"""

    scopes: list[ResourceHallFilterOption] = Field(default_factory=list)
    resource_types: list[ResourceHallFilterOption] = Field(default_factory=list)
    difficulties: list[ResourceHallFilterOption] = Field(default_factory=list)


class ResourceHallHighlights(BaseModel):
    """资源大厅推荐区、精选区和最近资源集合。"""

    featured: list[Resource] = Field(default_factory=list)
    recommended: list[Resource] = Field(default_factory=list)
    recent: list[Resource] = Field(default_factory=list)


class ResourceHallPagination(BaseModel):
    """资源大厅分页状态。"""

    page: int = 1
    page_size: int = 12
    total_items: int = 0
    total_pages: int = 1
    offset: int = 0
    has_prev: bool = False
    has_next: bool = False


class ResourceHallResponse(BaseModel):
    """资源大厅列表响应。

    同时返回分页资源、统计信息、筛选条件和高亮资源，前端据此完成资源发现页的完整渲染。
    """

    items: list[Resource] = Field(default_factory=list)
    stats: ResourceHallStats
    filters: ResourceHallFilters
    highlights: ResourceHallHighlights
    pagination: ResourceHallPagination
    course_id: str | None = None
    query: str | None = None
    generated_at: str
