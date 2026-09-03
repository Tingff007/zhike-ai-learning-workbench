from __future__ import annotations

from typing import Any

from app.core.tracing import get_trace_id
from app.services.model_gateway.budget_service import ModelGatewayBudgetService
from app.services.model_gateway.log_repository import ModelGatewayLogRepository
from app.services.model_gateway.runtime_types import GatewayProviderConfig


class ModelGatewayCallRecorder:
    """协调模型调用的成本估算、trace 注入和日志落库。"""

    def __init__(
        self,
        *,
        budget_service: ModelGatewayBudgetService,
        log_repository: ModelGatewayLogRepository,
    ) -> None:
        """注入预算服务和日志仓储，避免网关入口直接拼装日志细节。"""

        self._budget_service = budget_service
        self._log_repository = log_repository

    def record_call(
        self,
        *,
        course_slug: str | None,
        config: GatewayProviderConfig,
        agent_name: str,
        latency_ms: int,
        status: str,
        capability: str,
        error: str | None = None,
        request_count: int = 1,
        batch_count: int = 1,
        embedding_dim: int | None = None,
        token_input: int = 0,
        token_output: int = 0,
        meta_json: dict[str, Any] | None = None,
    ) -> None:
        """估算单次调用成本，并把完整排障上下文交给日志仓储。"""

        estimated_cost = self._budget_service.estimate_call_cost(
            config=config,
            capability=capability,
            token_input=token_input,
            token_output=token_output,
            request_count=request_count,
        )
        self._log_repository.record_call(
            course_slug=course_slug,
            config=config,
            agent_name=agent_name,
            latency_ms=latency_ms,
            status=status,
            error=error,
            capability=capability,
            request_count=request_count,
            batch_count=batch_count,
            embedding_dim=embedding_dim,
            token_input=token_input,
            token_output=token_output,
            meta_json=meta_json,
            estimated_cost=estimated_cost,
            trace_id=get_trace_id(),
        )
