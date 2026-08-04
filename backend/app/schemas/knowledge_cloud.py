from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Citation
from app.schemas.course import CourseDocumentItem


class KnowledgeUploadPolicyResponse(BaseModel):
    """知识库上传策略响应。"""

    max_upload_bytes: int
    allowed_extensions: list[str] = Field(default_factory=list)
    allowed_mime_types: list[str] = Field(default_factory=list)
    block_duplicate_upload: bool
    block_duplicate_filename: bool
    upload_timeout_seconds: int
    rag_backend: str


class KnowledgeDocumentUploadResponse(BaseModel):
    """知识库文档上传响应。"""

    model_config = ConfigDict(extra="allow")

    document_id: str
    course_id: str
    course_title: str | None = None
    filename: str
    parse_status: str
    vector_status: str
    review_status: str | None = None
    publish_readiness: str | None = None
    duplicate_of: str | None = None
    message: str | None = None
    rag_backend: str | None = None
    iflytek_file_id: str | None = None
    iflytek_repo_id: str | None = None
    cloud_status: str | None = None
    step_by_step: bool | None = None
    awaiting_activation: bool | None = None


class KnowledgeDocumentListResponse(BaseModel):
    """单课程知识库文档列表响应。"""

    course_id: str
    iflytek_repo_id: str | None = None
    items: list[CourseDocumentItem] = Field(default_factory=list)


class KnowledgeDocumentScopedListResponse(BaseModel):
    """管理端知识库文档范围列表响应。"""

    scope: str
    course_id: str | None = None
    course_title: str | None = None
    total: int = 0
    items: list[CourseDocumentItem] = Field(default_factory=list)


class CoursesWithKnowledgeResponse(BaseModel):
    """已具备可检索知识库的课程 ID 列表。"""

    course_ids: list[str] = Field(default_factory=list)


class ChatdocRepoDebugResponse(BaseModel):
    """ChatDoc 仓库诊断响应，允许透传云端调试字段。"""

    model_config = ConfigDict(extra="allow")


class ChatdocDocumentChunksResponse(BaseModel):
    """ChatDoc 云端切片预览响应，允许保留供应商扩展字段。"""

    model_config = ConfigDict(extra="allow")


class NativeChunkResplitResponse(BaseModel):
    """ChatDoc 原生切片重切提交响应。"""

    model_config = ConfigDict(extra="allow")

    status: str
    vendor: dict[str, Any] | None = None
    sync: dict[str, Any] | None = None


class IngestionTaskEvent(BaseModel):
    """知识库入库后台任务事件。"""

    event_id: str
    task_id: str
    task_type: str
    stage: str
    status: str
    message: str | None = None
    worker_id: str | None = None
    trace_id: str | None = None
    metrics: dict[str, Any] | None = None
    created_at: str | None = None


class IngestionStage(BaseModel):
    """知识库入库阶段状态。"""

    name: str
    status: str
    progress: int
    meta: dict[str, Any] | None = None


class KnowledgeIngestionStatusResponse(BaseModel):
    """知识库文档入库状态响应。"""

    document_id: str
    task_id: str | None = None
    stage: str | None = None
    attempt_count: int | None = None
    max_attempts: int | None = None
    worker_id: str | None = None
    trace_id: str | None = None
    locked_at: str | None = None
    heartbeat_at: str | None = None
    next_retry_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    status: str
    progress: int | None = None
    parse_status: str | None = None
    vector_status: str | None = None
    awaiting_activation: bool | None = None
    cloud_status: str | None = None
    local_native_chunk_count: int | None = None
    error: str | None = None
    result: dict[str, Any] | None = None
    asset_type_counts: dict[str, int] | None = None
    token_total: int | None = None
    average_tokens: float | None = None
    partial_chunks: int | None = None
    isolated_output_chunks: int | None = None
    events: list[IngestionTaskEvent] = Field(default_factory=list)
    stages: list[IngestionStage] = Field(default_factory=list)


class KnowledgeDocumentRecycleResponse(BaseModel):
    """知识库文档回收响应。"""

    model_config = ConfigDict(extra="allow")

    status: str
    document_id: str
    title: str | None = None
    filename: str | None = None
    recycled_at: str | None = None
    chatdoc_preserved: bool | None = None


class KnowledgeDocumentPurgeResponse(BaseModel):
    """知识库文档物理清理响应。"""

    model_config = ConfigDict(extra="allow")

    status: str
    document_id: str
    title: str | None = None
    filename: str | None = None
    cleanup: dict[str, Any] | None = None
    chatdoc: dict[str, Any] | None = None


class RecycledKnowledgeDocumentListResponse(BaseModel):
    """知识库回收站文档列表响应。"""

    total: int = 0
    items: list[CourseDocumentItem] = Field(default_factory=list)


class KnowledgeDocumentRestoreResponse(BaseModel):
    """知识库文档恢复响应。"""

    document_id: str
    title: str | None = None
    status: str


class KnowledgeSearchResponse(BaseModel):
    """知识库检索响应，保留过滤诊断扩展字段。"""

    model_config = ConfigDict(extra="allow")

    course_id: str
    query: str
    retrieval_mode: str
    items: list[Citation] = Field(default_factory=list)
    latency_ms: int
    wiki_filter_score: float | None = None


class VectorizeActivateRequest(BaseModel):
    """提交待授权文档向量化激活请求。"""

    document_ids: list[str] = Field(..., min_length=1, description="本地 documents.id，须处于待授权入库状态")
    integration_key: str | None = Field(default=None, description="RAG 接入实例 key，默认当前启用项")
    pipeline_stage_json: dict[str, Any] | None = Field(
        default=None,
        description="extract_embed 阶段 body（可选，向量化激活时一般无需填写）",
    )


class DocumentExtractRequest(BaseModel):
    """提交云端已向量化文档的问答萃取请求。"""

    document_ids: list[str] = Field(..., min_length=1, description="本地 documents.id，云端须处于 vectored 状态")
    integration_key: str | None = Field(default=None, description="RAG 接入实例 key，默认当前启用项")
    pipeline_stage_json: dict[str, Any] | None = Field(
        default=None,
        description="extract_embed 阶段 body，含 /openapi/v1/qa/extract 等字段",
    )


class VectorizeActivateItemResult(BaseModel):
    """文档向量化激活或萃取批处理的单项结果。"""

    document_id: str
    iflytek_file_id: str | None = None
    reason: str | None = None


class NativeChunkVectorizeSubmitResponse(BaseModel):
    """单文档原生切片向量化提交响应。"""

    accepted: list[VectorizeActivateItemResult] = Field(default_factory=list)
    rejected: list[VectorizeActivateItemResult] = Field(default_factory=list)


class VectorizeActivateResponse(BaseModel):
    """批量向量化激活响应。"""

    accepted: list[VectorizeActivateItemResult]
    rejected: list[VectorizeActivateItemResult]
    target_status: str = "vectoring"
    message: str


class DocumentExtractResponse(BaseModel):
    """批量文档问答萃取响应。"""

    accepted: list[VectorizeActivateItemResult]
    rejected: list[VectorizeActivateItemResult]
    message: str
