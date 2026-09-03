from typing import Any, Literal

from pydantic import BaseModel, Field


class NativeChunkItem(BaseModel):
    """本地持久化的 ChatDoc 原生切片。"""

    chunk_id: str
    file_id: str | None = None
    index: int
    page: int | None = None
    content: str
    char_count: int
    vector_status: Literal[
        "pending_vectorization",
        "vectorized",
        "edited_pending",
        "error",
    ] = "pending_vectorization"
    vendor_content: str | None = None
    content_version: int | None = None
    embedded_content_version: int | None = None
    embedding_error: str | None = None
    updated_at: str | None = None
    tags: list[str] = Field(default_factory=list)
    vendor_chunk_id: str | None = None
    char_start: Any = None
    char_end: Any = None
    data_type: str | None = None


class NativeChunkListResponse(BaseModel):
    """本地原生切片列表响应。"""

    document_id: str
    file_id: str | None = None
    vector_status: str | None = None
    cloud_chunk_total: int | None = None
    local_chunk_total: int
    reconciliation_ok: bool | None = None
    synced_at: str | None = None
    total: int
    limit: int
    offset: int
    items: list[NativeChunkItem]


class NativeChunkRevisionSummary(BaseModel):
    """原生切片快照摘要。"""

    revision_id: str
    revision_no: int
    label: str


class NativeChunkSyncResponse(BaseModel):
    """原生切片同步响应。"""

    document_id: str
    file_id: str
    total: int
    created: int
    updated: int
    removed: int
    synced_at: str
    revision: NativeChunkRevisionSummary | None = None


class NativeChunkResplitRequest(BaseModel):
    """原生切片重切请求。"""

    integration_key: str | None = None
    split_body: dict[str, Any] | None = Field(
        default=None,
        description="POST /file/split 业务体，如 wikiSplitExtends.chunkSize / minChunkSize",
    )
    sync_after: bool = Field(default=True, description="重切完成后是否自动拉取 GET file/chunks 覆盖本地")


class NativeChunkUpdateRequest(BaseModel):
    """原生切片人工修订请求。"""

    content: str | None = None
    tags: list[str] | None = None
    page: int | None = None


class NativeChunkEmbedRequest(BaseModel):
    """原生切片向量化请求。"""

    integration_key: str | None = None
    document_ids: list[str] | None = Field(
        default=None,
        description="若仅传 document_id 路径参数可省略；用于批量激活向量化",
    )


class NativeChunkRevisionItem(BaseModel):
    """原生切片历史快照列表项。"""

    revision_id: str
    revision_no: int
    label: str
    source: str
    is_baseline: bool
    chunk_count: int
    created_at: str | None = None
    is_active: bool | None = None
    is_baseline_marker: bool | None = None


class NativeChunkRevisionListResponse(BaseModel):
    """原生切片历史快照列表响应。"""

    document_id: str
    items: list[NativeChunkRevisionItem] = Field(default_factory=list)
    baseline_revision_id: str | None = None


class NativeChunkRevisionRestoreResponse(BaseModel):
    """原生切片历史快照恢复响应。"""

    document_id: str
    file_id: str
    total: int
    created: int
    updated: int
    removed: int
    synced_at: str
    restored_from_revision_id: str
    restored_from_label: str
    new_revision_id: str
    new_revision_no: int
