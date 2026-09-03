from typing import Any, Literal

from pydantic import BaseModel, Field


class Course(BaseModel):
    """课程基础信息响应。"""

    id: str
    title: str
    description: str
    status: str = "published"
    applicable_major: str | None = None
    display_config: dict[str, Any] = Field(default_factory=dict)
    deleted_at: str | None = None


class CourseListResponse(BaseModel):
    """课程列表响应。"""

    items: list[Course]


class CourseAiContextResponse(BaseModel):
    """课程 AI 对话上下文响应。"""

    course_id: str
    course_title: str
    knowledge_ready: bool
    chat_input_enabled: bool
    primary_file_id: str | None = None
    file_ids_count: int = 0
    integration_key: str | None = None
    spark_version: str | None = None
    qa_mode: str | None = None
    rag_backend: str | None = None
    require_citation_for_course_answer: bool = True
    default_use_course_evidence_for_resource: bool = True
    blocking_reason: str | None = None
    status_label: str


class CourseDocumentItem(BaseModel):
    """课程资料列表中的单个文档。"""

    id: str
    title: str
    filename: str
    mime_type: str | None = None
    parse_status: str
    vector_status: str
    text_vector_status: str | None = None
    visual_vector_status: str | None = None
    review_status: str | None = None
    publish_readiness: str | None = None
    chunk_count: int = 0
    page_count: int = 0
    source_type: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    parser_version: str | None = None
    chunker_version: str | None = None
    course_id: str | None = None
    course_title: str | None = None
    duplicate_of: str | None = None
    iflytek_file_id: str | None = None
    iflytek_repo_id: str | None = None
    chatdoc_sid: str | None = None
    chatdoc_file_status: str | None = None
    cloud_status: str | None = None
    awaiting_activation: bool = False
    chatdoc_step_by_step: bool | None = None
    parse_type: str | None = None
    chatdoc_error: str | None = None
    last_synced_at: str | None = None
    ingestion_duration_ms: int | None = None
    native_chunks_synced_at: str | None = None
    local_native_chunk_count: int = 0
    rag_backend: str | None = None
    pending_activation_vector_status: list[str] = Field(default_factory=list)
    awaiting_publish_readiness: list[str] = Field(default_factory=list)


class CourseDocumentListResponse(BaseModel):
    """课程资料列表响应。"""

    course_id: str
    iflytek_repo_id: str | None = None
    items: list[CourseDocumentItem] = Field(default_factory=list)


class ExtractedQaItemResponse(BaseModel):
    """本地萃取问答条目响应。"""

    id: str
    course_id: str
    document_id: str
    iflytek_file_id: str
    question: str
    answer: str


class CourseExtractedQaResponse(BaseModel):
    """课程本地萃取问答列表响应。"""

    course_id: str
    items: list[ExtractedQaItemResponse] = Field(default_factory=list)


class UserCourseListResponse(CourseListResponse):
    """当前用户可访问课程列表响应。"""

    user: str


class CurrentCourseResponse(BaseModel):
    """当前课程选择响应。"""

    course_id: str | None = None


class CurrentCourseUpdateResponse(CurrentCourseResponse):
    """当前课程更新结果。"""

    message: str


class CourseConcept(BaseModel):
    """课程知识点响应。"""

    id: str
    course_id: str
    title: str
    definition: str | None = None
    section_id: str | None = None
    section_title: str = "未分章"
    difficulty: str = "basic"
    recommended_order: int = 0
    prerequisites: list[str] = Field(default_factory=list)
    mastery: int = 0
    status: str = "published"


class CourseSection(BaseModel):
    """课程章节响应。"""

    id: str
    course_id: str
    title: str
    description: str | None = None
    order_index: int = 0
    concepts: list[dict[str, Any]] = Field(default_factory=list)


class CourseConceptOutlineResponse(BaseModel):
    """课程知识点与章节大纲响应。"""

    items: list[CourseConcept]
    sections: list[CourseSection]


class AdminCourseMutationResponse(BaseModel):
    """管理端课程变更响应。"""

    status: str
    course: Course
    course_id: str | None = None


class AdminCourseDeleteResponse(BaseModel):
    """管理端课程删除响应，兼容软删除和物理删除。"""

    status: str
    course_id: str
    slug: str | None = None
    title: str | None = None
    documents_purged: list[str] = Field(default_factory=list)


class AdminSectionDeleteResponse(BaseModel):
    """管理端章节删除响应。"""

    status: str
    course_id: str
    section_id: str


class AdminCourseSectionMutationResponse(BaseModel):
    """管理端章节创建或更新响应。"""

    status: str
    section: CourseSection


class AdminCourseConceptMutationResponse(BaseModel):
    """管理端知识点创建或更新响应。"""

    status: str
    concept: CourseConcept


class CourseReadinessCheck(BaseModel):
    """课程发布前检查项。"""

    key: str
    label: str
    status: str
    blocking: bool
    detail: str
    action_label: str
    action_href: str


class CourseReadinessResponse(BaseModel):
    """课程发布准备度响应。"""

    ready: bool
    score: int
    checks: list[CourseReadinessCheck] = Field(default_factory=list)
    blocking: list[str] = Field(default_factory=list)
    next_action: str


class CourseBuilderDocumentStats(BaseModel):
    """课程构建器资料统计。"""

    document_total: int = 0
    chunk_total: int = 0
    embedding_ready: int = 0
    failed_tasks: int = 0


class CourseBuilderChunkPreview(BaseModel):
    """课程构建器切片预览。"""

    chunk_id: str
    source_title: str
    page_no: int | None = None
    section_path: str | None = None
    asset_type: str | None = None
    heading_path: list[str] = Field(default_factory=list)
    heading_number: str | None = None
    content: str | None = None
    quality: float = 0


class CourseBuilderAssetBinding(BaseModel):
    """课程构建器资料切片与知识点绑定。"""

    binding_id: str
    chunk_id: str
    document_id: str | None = None
    page_asset_id: str | None = None
    element_id: str | None = None
    source_title: str | None = None
    source_filename: str | None = None
    page_no: int | None = None
    section_path: str | None = None
    asset_type: str | None = None
    heading_path: list[str] = Field(default_factory=list)
    heading_path_text: str | None = None
    heading_number: str | None = None
    content: str | None = None
    quality: float | None = None
    token_count: int | None = None
    reading_order_index: int | None = None
    embedding_status: str | None = None
    similarity: float | None = None


class CourseBuilderOutlineResponse(BaseModel):
    """管理端课程构建器大纲响应。"""

    course: Course
    sections: list[CourseSection] = Field(default_factory=list)
    unsectioned_concepts: list[CourseConcept] = Field(default_factory=list)
    readiness: CourseReadinessResponse | None = None
    document_stats: CourseBuilderDocumentStats
    chunk_preview: list[CourseBuilderChunkPreview] = Field(default_factory=list)
    asset_bindings: list[CourseBuilderAssetBinding] = Field(default_factory=list)


class CourseOutlineImportStats(BaseModel):
    """课程大纲导入预览统计。"""

    sections: int = 0
    concepts: int = 0
    excluded: int = 0


class CourseOutlineImportResponse(BaseModel):
    """课程大纲导入预览响应。"""

    status: str
    source_name: str
    sections: list["CourseOutlineSectionDraft"] = Field(default_factory=list)
    stats: CourseOutlineImportStats
    warnings: list[str] = Field(default_factory=list)


class CourseOutlineApplyResponse(BaseModel):
    """课程大纲应用结果响应。"""

    status: str
    mode: Literal["replace", "merge"]
    course: Course
    sections_created: int = 0
    sections_updated: int = 0
    concepts_created: int = 0
    concepts_updated: int = 0
    backup_created: bool = False
    paths_archived: bool = False


class AdminResourceReviewEchoResponse(BaseModel):
    """管理端资源审核占位响应。"""

    resource_id: str
    review: dict[str, Any]
    status: str


class CurrentCourseUpdate(BaseModel):
    """当前课程切换请求。"""

    course_id: str


class CourseCreateRequest(BaseModel):
    """管理端创建课程请求。"""

    slug: str | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    applicable_major: str | None = None
    status: str = "draft"
    cover_url: str | None = None
    is_default: bool = False
    display_config: dict[str, Any] = Field(default_factory=dict)


class CourseUpdateRequest(BaseModel):
    """管理端更新课程请求。"""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    applicable_major: str | None = None
    status: str | None = None
    cover_url: str | None = None
    is_default: bool | None = None
    display_config: dict[str, Any] | None = None


class CourseSectionUpsertRequest(BaseModel):
    """管理端创建或更新课程章节请求。"""

    code: str | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    order_index: int | None = None


class CourseConceptCreateRequest(BaseModel):
    """管理端创建课程知识点请求。"""

    code: str | None = None
    title: str = Field(min_length=1, max_length=200)
    section_code: str | None = None
    section_title: str | None = None
    definition: str | None = None
    difficulty: str = "basic"
    recommended_order: int | None = None
    prerequisites: list[str] = Field(default_factory=list)
    status: str = "published"


class CourseConceptUpdateRequest(BaseModel):
    """管理端更新课程知识点请求。"""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    section_code: str | None = None
    section_title: str | None = None
    definition: str | None = None
    difficulty: str | None = None
    recommended_order: int | None = None
    prerequisites: list[str] | None = None
    status: str | None = None


class CourseGenerateFromAIRequest(BaseModel):
    """AI 生成课程大纲请求。"""

    course_name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    section_limit: int = Field(default=8, ge=1, le=8)
    concept_limit_per_section: int = Field(default=4, ge=1, le=4)


class CourseGenerateFromAIResponse(BaseModel):
    """AI 生成课程大纲结果响应。"""

    status: str
    course: Course
    sections_created: int
    concepts_created: int
    prerequisites_created: int
    generated_by: str = "model_gateway"


class CourseOutlineConceptDraft(BaseModel):
    """课程大纲导入中的知识点草稿。"""

    code: str | None = None
    title: str = Field(min_length=1, max_length=200)
    definition: str | None = None
    difficulty: str = "basic"
    recommended_order: int
    prerequisites: list[str] = Field(default_factory=list)
    status: str = "published"
    source_number: str | None = None
    source_title: str | None = None
    include: bool = True


class CourseOutlineSectionDraft(BaseModel):
    """课程大纲导入中的章节草稿。"""

    code: str | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    order_index: int
    source_number: str | None = None
    source_title: str | None = None
    include: bool = True
    concepts: list[CourseOutlineConceptDraft] = Field(default_factory=list)


class CourseOutlineImportRequest(BaseModel):
    """课程大纲导入预览请求。"""

    source_path: str | None = None
    readme_text: str | None = None
    source_name: str | None = None


class CourseOutlineApplyRequest(BaseModel):
    """课程大纲应用请求。"""

    mode: Literal["replace", "merge"] = "replace"
    course_title: str | None = None
    course_description: str | None = None
    sections: list[CourseOutlineSectionDraft]
    rebuild_prerequisites: bool = True
