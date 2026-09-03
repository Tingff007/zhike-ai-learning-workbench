from __future__ import annotations

from app.services.ai.intent.types import IntentCandidate, IntentRegistryConfig, IntentRoute


class ClarificationPolicy:
    """按阈值、分差和风险等级决定是否需要澄清。"""

    def __init__(self, registry: IntentRegistryConfig) -> None:
        self.registry = registry
        self.intent_map = registry.intent_map()

    def apply(self, route: IntentRoute) -> IntentRoute:
        """对候选路由执行置信度和风险策略。"""
        if route.intent in {"default_chat", "general_chat"}:
            return route
        definition = self.intent_map.get(route.intent)
        execution_threshold = definition.execution_threshold if definition and definition.execution_threshold is not None else self.registry.global_settings.execution_threshold
        clarification_threshold = (
            definition.clarification_threshold
            if definition and definition.clarification_threshold is not None
            else self.registry.global_settings.clarification_threshold
        )
        margin_threshold = definition.margin_threshold if definition and definition.margin_threshold is not None else self.registry.global_settings.margin_threshold
        margin = self._candidate_margin(route.candidates)
        high_risk_threshold = self.registry.global_settings.high_risk_threshold
        high_risk = bool(definition and definition.risk_level == "high")

        if route.confidence < clarification_threshold:
            return IntentRoute(
                "default_chat",
                route.confidence,
                f"语义置信度不足，回退普通对话：{route.reason}",
                "fallback",
                route.candidates,
            )
        if route.confidence < execution_threshold:
            return self._clarify(route, f"低于执行阈值 {execution_threshold:.2f}")
        if len(route.candidates) > 1 and margin < margin_threshold and route.source in {"embedding", "small_model", "llm_judge"}:
            return self._clarify(route, f"top1/top2 分差 {margin:.2f} 低于阈值 {margin_threshold:.2f}")
        if high_risk and route.confidence < high_risk_threshold:
            return self._clarify(route, f"高风险意图置信度 {route.confidence:.2f} 低于阈值 {high_risk_threshold:.2f}")
        return route

    def _clarify(self, route: IntentRoute, reason: str) -> IntentRoute:
        """生成需要澄清的路由结果。"""
        prompt = self.registry.global_settings.clarification.high_risk_prompt
        definition = self.intent_map.get(route.intent)
        if not definition or definition.risk_level != "high":
            prompt = self.registry.global_settings.clarification.prompt
        return IntentRoute(
            "default_chat",
            route.confidence,
            f"{reason}，需要澄清：{route.reason}",
            "fallback",
            route.candidates,
            needs_clarification=True,
            fallback_intent=route.intent,
            clarification_prompt=prompt,
        )

    @staticmethod
    def _candidate_margin(candidates: tuple[IntentCandidate, ...]) -> float:
        """计算前两名候选分差。"""
        if len(candidates) < 2:
            return 1.0
        sorted_candidates = sorted(candidates, key=lambda item: item.score, reverse=True)
        return max(0.0, sorted_candidates[0].score - sorted_candidates[1].score)
