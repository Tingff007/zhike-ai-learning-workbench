from pydantic import BaseModel, Field


class ApiResponse(BaseModel):
    """通用接口响应包装，适合无需分页的简单结果。"""

    success: bool = True
    message: str = "ok"
    data: dict | list | None = None


class PageMeta(BaseModel):
    """分页响应的页码、页大小和总数信息。"""

    page: int = 1
    page_size: int = 20
    total: int = 0


class PageResponse(BaseModel):
    """通用分页响应结构，items 由具体接口定义元素类型。"""

    items: list
    meta: PageMeta


class Citation(BaseModel):
    """回答引用证据，兼容本地切片、讯飞文档和页面资产定位信息。"""

    source_id: str
    source_title: str
    page_no: int | None = None
    iflytek_file_id: str | None = None
    chunk_index: int | None = None
    local_chunk_id: str | None = None
    provenance_source: str | None = None
    chunk_id: str | None = None
    kind: str = "chunk"
    page_asset_id: str | None = None
    element_id: str | None = None
    asset_type: str | None = None
    heading_path_text: str | None = None
    heading_number: str | None = None
    bbox: list[float] | None = None
    bbox_norm: list[float] | None = None
    evidence_uri: str | None = None
    section_path: str | None = None
    retrieval_mode: str | None = None
    fusion_score: float | None = None
    rerank_score: float | None = None
    tower: str | None = None
    similarity: float = Field(default=0.0, ge=0, le=1)
    snippet: str
    content: str | None = None
