from __future__ import annotations

from collections.abc import Sequence

from app.schemas.ai import AiMessageRequest
from app.services.ai.intent.types import IntentCandidate, IntentDefinition, IntentRegistryConfig, IntentRoute, IntentType


def normalize_text(text: str) -> str:
    """归一化文本，便于中文短语匹配。"""
    return "".join(str(text or "").lower().split())


class RuleRouter:
    """基于显式字段、可解释规则和短追问上下文的路由器。"""

    _COURSE_RAG_INTENTS = {"COURSE_RAG_QA", "KNOWLEDGE_QA"}
    _RESOURCE_INTENTS = {"RESOURCE_GENERATION"}

    def __init__(self, registry: IntentRegistryConfig) -> None:
        self.registry = registry
        self.intent_map = registry.intent_map()

    def classify_explicit(self, payload: AiMessageRequest) -> IntentRoute | None:
        """优先识别前端或上游明确传入的结构化意图。"""
        if payload.action_type == "resource_generation" or payload.intent_type in self._RESOURCE_INTENTS:
            return IntentRoute("resource_generation", 1.0, "显式资源生成动作", "explicit")
        if payload.mode == "course_rag_qa" or payload.intent_type in self._COURSE_RAG_INTENTS:
            return IntentRoute("course_rag_qa", 1.0, "显式课程资料问答模式", "explicit")
        if payload.intent_type == "GENERAL_CHAT":
            return IntentRoute("general_chat", 1.0, "显式通用对话意图", "explicit")
        return None

    def classify_by_rule(self, payload: AiMessageRequest) -> IntentRoute | None:
        """按 Registry 中的高精度规则识别意图。"""
        message = normalize_text(payload.message)
        if not message:
            return IntentRoute("default_chat", 0.2, "空消息，回退普通对话", "fallback")

        candidates: list[IntentCandidate] = []
        for definition in self.registry.enabled_intents():
            score, reason = self._match_definition(definition, message)
            if score <= 0:
                continue
            candidates.append(IntentCandidate(definition.name, score, "rule", reason))

        if not candidates:
            return None
        sorted_candidates = tuple(sorted(candidates, key=lambda item: item.score, reverse=True))
        top = sorted_candidates[0]
        return IntentRoute(top.intent, top.score, top.reason, top.source, sorted_candidates)

    def classify_by_context(self, payload: AiMessageRequest, history: Sequence[str] | None) -> IntentRoute | None:
        """基于上一轮路由识别短追问，但不覆盖明确的新学习入口。"""
        message = normalize_text(payload.message)
        if any(normalize_text(item) in message for item in self.registry.global_settings.context_block_phrases):
            return None
        history_intents = [self.normalize_history_intent(item) for item in self.history_from_payload(payload, history)]
        last_intent = next((item for item in reversed(history_intents) if item), None)
        if last_intent == "learning_progress_query" and any(normalize_text(term) in message for term in self.registry.global_settings.context_follow_up_phrases):
            return IntentRoute("learning_progress_query", 0.88, "上一轮为学习进度，本轮为短追问", "context")
        return None

    def _match_definition(self, definition: IntentDefinition, message: str) -> tuple[float, str]:
        """返回单个意图规则命中的分数和原因。"""
        rules = definition.rules
        if any(normalize_text(term) in message for term in rules.negative_contains_any):
            return 0.0, ""
        exact_hits = [term for term in rules.exact_any if normalize_text(term) == message]
        if exact_hits:
            return 0.94, f"命中 {definition.name} 精确规则：{exact_hits[0]}"
        contains_hits = [term for term in rules.contains_any if normalize_text(term) in message]
        if contains_hits:
            return 0.86, f"命中 {definition.name} 包含规则：{contains_hits[0]}"
        for group in rules.contains_all:
            normalized_group = [normalize_text(item) for item in group]
            if normalized_group and all(item in message for item in normalized_group):
                return 0.87, f"命中 {definition.name} 组合规则：{' + '.join(group)}"
        return 0.0, ""

    @classmethod
    def history_from_payload(cls, payload: AiMessageRequest, history: Sequence[str] | None) -> list[str]:
        """合并显式 history 参数和 clientContext 中的上一轮路由。"""
        items = list(history or [])
        context = payload.client_context if isinstance(payload.client_context, dict) else {}
        for key in ("lastIntentRoute", "last_intent_route", "lastIntent", "last_intent"):
            value = context.get(key)
            if isinstance(value, str) and value:
                items.append(value)
        raw_history = context.get("intentHistory") or context.get("intent_history")
        if isinstance(raw_history, list):
            items.extend(str(item) for item in raw_history if item)
        return items

    @staticmethod
    def normalize_history_intent(value: str) -> IntentType | None:
        """兼容前端响应 route 和内部意图名。"""
        normalized = str(value or "").strip()
        route_map: dict[str, IntentType] = {
            "learning_progress": "learning_progress_query",
            "learning_plan": "learning_plan_request",
            "course_rag_qa": "course_rag_qa",
            "resource_generation": "resource_generation",
            "default_chat": "default_chat",
            "general_chat": "general_chat",
        }
        if normalized in route_map:
            return route_map[normalized]
        if normalized in {
            "start_learning_session",
            "learning_plan_request",
            "learning_progress_query",
            "course_rag_qa",
            "resource_generation",
            "default_chat",
            "general_chat",
        }:
            return normalized  # type: ignore[return-value]
        return None
