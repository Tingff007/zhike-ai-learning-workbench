from __future__ import annotations

import time
from collections.abc import Sequence

from sqlalchemy.orm import Session

from app.schemas.ai import AiMessageRequest
from app.services.ai.intent.clarification import ClarificationPolicy
from app.services.ai.intent.llm_judge import LlmJudgeProvider
from app.services.ai.intent.registry import IntentRegistryStore
from app.services.ai.intent.rules import RuleRouter, normalize_text
from app.services.ai.intent.semantic_provider import SemanticRouterProvider
from app.services.ai.intent.types import IntentCandidate, IntentRegistryConfig, IntentRoute, IntentSource, IntentType


class HybridIntentRouter:
    """IntentRouter 2.0 门面：保留旧入口，内部委托可插拔路由平台。"""

    def __init__(
        self,
        *,
        registry: IntentRegistryConfig | None = None,
        registry_store: IntentRegistryStore | None = None,
    ) -> None:
        self.registry_store = registry_store or IntentRegistryStore()
        self._registry_override = registry

    def classify(
        self,
        payload: AiMessageRequest,
        *,
        history: Sequence[str] | None = None,
    ) -> IntentRoute:
        """同步分类入口，适用于测试和不调用外部 Provider 的场景。"""
        started_at = time.perf_counter()
        registry = self._registry()
        rule_router = RuleRouter(registry)

        explicit = rule_router.classify_explicit(payload)
        if explicit:
            return self._with_latency(explicit, started_at)

        rule_route = rule_router.classify_by_rule(payload)
        if rule_route:
            return self._with_latency(ClarificationPolicy(registry).apply(rule_route), started_at)

        context_route = rule_router.classify_by_context(payload, history)
        if context_route:
            return self._with_latency(context_route, started_at)

        candidates = SemanticRouterProvider(registry).classify_local(payload.message)
        route = self._route_from_candidates(candidates, registry)
        route = ClarificationPolicy(registry).apply(route)
        return self._with_latency(route, started_at)

    async def classify_async(
        self,
        payload: AiMessageRequest,
        *,
        db: Session | None = None,
        history: Sequence[str] | None = None,
    ) -> IntentRoute:
        """异步分类入口，可按配置调用 ModelGateway embedding 和 LLM Judge。"""
        started_at = time.perf_counter()
        registry = self._registry()
        rule_router = RuleRouter(registry)

        explicit = rule_router.classify_explicit(payload)
        if explicit:
            return self._with_latency(explicit, started_at)

        rule_route = rule_router.classify_by_rule(payload)
        if rule_route:
            return self._with_latency(ClarificationPolicy(registry).apply(rule_route), started_at)

        context_route = rule_router.classify_by_context(payload, history)
        if context_route:
            return self._with_latency(context_route, started_at)

        candidates = await SemanticRouterProvider(registry).classify_async(payload, db)
        route = self._route_from_candidates(candidates, registry)

        judge = LlmJudgeProvider(registry)
        if judge.should_judge(route):
            judged_route = await judge.judge(payload, route, db)
            if judged_route:
                route = judged_route

        route = ClarificationPolicy(registry).apply(route)
        return self._with_latency(route, started_at)

    @classmethod
    def normalize_text(cls, text: str) -> str:
        """兼容旧测试和调用方的文本归一化入口。"""
        return normalize_text(text)

    def _registry(self) -> IntentRegistryConfig:
        """返回当前有效 Registry。"""
        return self._registry_override or self.registry_store.load_active()

    def _route_from_candidates(
        self,
        candidates: Sequence[IntentCandidate],
        registry: IntentRegistryConfig,
    ) -> IntentRoute:
        """根据语义候选执行置信度校准，业务策略由 ClarificationPolicy 收口。"""
        if not candidates:
            return IntentRoute("default_chat", 0.45, "未命中特定意图，按默认对话处理", "fallback")

        sorted_candidates = tuple(sorted(candidates, key=lambda item: item.score, reverse=True))
        top = sorted_candidates[0]
        runner_up = sorted_candidates[1] if len(sorted_candidates) > 1 else None
        margin = top.score - (runner_up.score if runner_up else 0.0)
        confidence = self._calibrate_confidence(top.score, margin, top.source)

        if top.intent in {"default_chat", "general_chat"}:
            return IntentRoute(top.intent, confidence, top.reason, top.source, sorted_candidates)

        definition = registry.intent_map().get(top.intent)
        execution_threshold = definition.execution_threshold if definition and definition.execution_threshold is not None else registry.global_settings.execution_threshold
        if confidence >= min(execution_threshold, 0.99):
            return IntentRoute(top.intent, confidence, top.reason, top.source, sorted_candidates)
        return IntentRoute(top.intent, confidence, top.reason, top.source, sorted_candidates)

    @staticmethod
    def _calibrate_confidence(score: float, margin: float, source: IntentSource) -> float:
        """把 Provider 原始分数校准为业务置信度。"""
        source_bonus = 0.08 if source == "embedding" else 0.03 if source == "small_model" else 0.0
        margin_bonus = min(0.12, max(0.0, margin) * 0.35)
        calibrated = 0.18 + score * 0.68 + source_bonus + margin_bonus
        return round(max(0.0, min(0.99, calibrated)), 4)

    @staticmethod
    def _with_latency(route: IntentRoute, started_at: float) -> IntentRoute:
        """补充路由耗时。"""
        return IntentRoute(
            intent=route.intent,
            confidence=route.confidence,
            reason=route.reason,
            source=route.source,
            candidates=route.candidates,
            needs_clarification=route.needs_clarification,
            fallback_intent=route.fallback_intent,
            latency_ms=int((time.perf_counter() - started_at) * 1000),
            clarification_prompt=route.clarification_prompt,
        )
