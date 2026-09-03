from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class MetricsSummaryResponse(BaseModel):
    """管理端首页指标摘要响应。"""

    model_config = ConfigDict(extra="allow")

    dau: int = 0
    course_visits: int = 0
    path_nodes_completed: int = 0
    rag_hit_rate: float = 0
    citation_coverage: float = 0
    resource_success_rate: float = 0
    p95_latency: float = 0
    model_failure_rate: float = 0
    queue_backlog: int = 0
    safety_blocks: int = 0
    metric_date: str | None = None
    has_runtime_data: bool | None = None


class OperationsTrendPoint(BaseModel):
    """运维趋势中的单日指标点。"""

    model_config = ConfigDict(extra="allow")

    date: str
    dau: int = 0
    course_visits: int = 0
    path_nodes_completed: int = 0
    rag_hit_rate: float = 0
    citation_coverage: float = 0
    resource_success_rate: float = 0
    p95_latency: float = 0
    model_failure_rate: float = 0
    queue_backlog: int = 0
    cloud_stuck_docs: int | None = None
    token_output_today: int | None = None
    estimated_cost_today: float | None = None
    safety_blocks: int = 0
    has_runtime_data: bool | None = None


class OperationsTrendsResponse(BaseModel):
    """运维趋势接口响应。"""

    model_config = ConfigDict(extra="allow")

    items: list[OperationsTrendPoint] = Field(default_factory=list)
    course_id: str | None = None
    days: int


class OperationsModelCallsResponse(BaseModel):
    """模型调用运营统计响应。"""

    model_config = ConfigDict(extra="allow")

    total_calls: int = 0
    failed_calls: int = 0
    failure_rate: float = 0
    avg_latency_ms: float = 0
    p95_latency_ms: float | None = None
    token_input: int = 0
    token_output: int = 0
    estimated_cost: float | None = None
    items: list[dict[str, Any]] = Field(default_factory=list)
    by_agent: list[dict[str, Any]] = Field(default_factory=list)


class OperationsRagReportResponse(BaseModel):
    """RAG 运营质量报告响应。"""

    model_config = ConfigDict(extra="allow")

    total_queries: int = 0
    hit_queries: int = 0
    hit_rate: float = 0
    avg_top_score: float = 0
    citation_coverage: float = 0
    refused_queries: int = 0
    low_confidence_queries: int = 0
    avg_latency_ms: float = 0
    by_intent: list[dict[str, Any]] = Field(default_factory=list)
    low_confidence_samples: list[dict[str, Any]] = Field(default_factory=list)


class OperationsQueueReport(BaseModel):
    """运维队列状态响应片段。"""

    model_config = ConfigDict(extra="allow")

    backlog: int = 0
    resource_generation: list[dict[str, Any]] = Field(default_factory=list)
    document_parse: list[dict[str, Any]] = Field(default_factory=list)
    vectorization: list[dict[str, Any]] = Field(default_factory=list)
    retrieval_verification: list[dict[str, Any]] = Field(default_factory=list)


class OperationsDashboardResponse(BaseModel):
    """运维监控总览响应。"""

    model_config = ConfigDict(extra="allow")

    course_id: str | None = None
    days: int
    generated_at: str
    overview: MetricsSummaryResponse
    trends: list[OperationsTrendPoint] = Field(default_factory=list)
    model_calls: OperationsModelCallsResponse
    embedding_report: dict[str, Any] | None = None
    rag_report: OperationsRagReportResponse
    queues: OperationsQueueReport
    cloud_ingestion: dict[str, Any] | None = None
    chatdoc_ingestion: dict[str, Any] | None = None
    cost_trends: list[dict[str, Any]] = Field(default_factory=list)
    cloud_ops: dict[str, Any] | None = None
    ai_dialogue: dict[str, Any] | None = None
    resource_failures: dict[str, Any] | None = None
    recent_events: list[dict[str, Any]] = Field(default_factory=list)
    alerts: list[dict[str, Any]] = Field(default_factory=list)
