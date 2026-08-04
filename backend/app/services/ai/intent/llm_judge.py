from __future__ import annotations

import json
import logging
import re
from typing import Any

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.schemas.ai import AiMessageRequest
from app.services.ai.intent.types import IntentCandidate, IntentRegistryConfig, IntentRoute, IntentType

logger = logging.getLogger(__name__)


class LlmJudgeDecision(BaseModel):
    """LLM Judge 的结构化输出。"""

    intent: IntentType
    confidence: float = Field(ge=0, le=1)
    slots: dict[str, Any] = Field(default_factory=dict)
    needs_clarification: bool = False
    reason: str


class LlmJudgeProvider:
    """低置信场景下的云端结构化判别 Provider。"""

    def __init__(self, registry: IntentRegistryConfig) -> None:
        self.registry = registry

    async def judge(self, payload: AiMessageRequest, route: IntentRoute, db: Session | None) -> IntentRoute | None:
        """在配置允许且有数据库会话时调用 ModelGateway ChatProvider。"""
        if not self.registry.global_settings.llm_judge_enabled or db is None:
            return None
        try:
            from app.services.model_gateway.router import ModelGateway
        except Exception:
            logger.debug("加载 ModelGateway 失败，LLM Judge 将跳过本轮判别。", exc_info=True)
            return None

        prompt = self._prompt(payload, route)
        try:
            result = await ModelGateway(db).complete_chat(
                messages=[
                    {"role": "system", "content": "你是学习产品的意图路由审查器，只输出 JSON。"},
                    {"role": "user", "content": prompt},
                ],
                course_slug=payload.course_id,
                agent_name="IntentRouter LLM Judge",
                temperature=0,
                max_tokens=360,
                allow_fallback=False,
                json_mode=True,
            )
            decision = self._parse_decision(result.answer)
        except Exception:
            logger.warning(
                "LLM Judge 判别失败，将保留原意图路由：course_id=%s route_intent=%s",
                payload.course_id,
                route.intent,
                exc_info=True,
            )
            return None
        if not decision:
            return None
        candidate = IntentCandidate(decision.intent, decision.confidence, "llm_judge", decision.reason)
        return IntentRoute(
            decision.intent,
            round(decision.confidence, 4),
            f"LLM Judge 结构化判别：{decision.reason}",
            "llm_judge",
            (candidate, *route.candidates[:2]),
            needs_clarification=decision.needs_clarification,
            fallback_intent=decision.intent if decision.needs_clarification else None,
        )

    def should_judge(self, route: IntentRoute) -> bool:
        """判断当前候选是否需要进入 LLM Judge。"""
        if not settings.INTENT_ROUTER_LLM_JUDGE_ENABLED:
            return False
        if route.intent in {"default_chat", "general_chat"}:
            return False
        intent = self.registry.intent_map().get(route.intent)
        execution_threshold = intent.execution_threshold if intent and intent.execution_threshold is not None else self.registry.global_settings.execution_threshold
        margin_threshold = intent.margin_threshold if intent and intent.margin_threshold is not None else self.registry.global_settings.margin_threshold
        margin = 1.0
        if len(route.candidates) > 1:
            sorted_candidates = sorted(route.candidates, key=lambda item: item.score, reverse=True)
            margin = sorted_candidates[0].score - sorted_candidates[1].score
        high_risk_needs_check = bool(intent and intent.risk_level == "high" and route.confidence < self.registry.global_settings.high_risk_threshold)
        return route.confidence < execution_threshold or margin < margin_threshold or high_risk_needs_check

    def _prompt(self, payload: AiMessageRequest, route: IntentRoute) -> str:
        """构造结构化判别提示词。"""
        intent_lines = [
            f"- {item.name}: {item.display_name}。{item.description}。响应 route={item.response_route}，风险={item.risk_level}"
            for item in self.registry.enabled_intents()
        ]
        candidates = [
            {"intent": item.intent, "score": item.score, "source": item.source, "reason": item.reason}
            for item in route.candidates[:5]
        ]
        return (
            "请判断用户真实学习意图。只输出 JSON，字段必须为："
            "intent, confidence, slots, needs_clarification, reason。\n"
            f"可选意图：\n{chr(10).join(intent_lines)}\n"
            f"用户消息：{payload.message}\n"
            f"课程 ID：{payload.course_id or '无'}\n"
            f"当前候选：{json.dumps(candidates, ensure_ascii=False)}\n"
            "注意：必须遵守 Registry 中的正例、负例、风险等级和响应 route；"
            "semantic 候选只能作为证据，不能直接决定业务动作。"
        )

    @staticmethod
    def _parse_decision(answer: str) -> LlmJudgeDecision | None:
        """解析模型返回的 JSON 判别结果。"""
        raw = (answer or "").strip()
        if not raw:
            return None
        match = re.search(r"\{.*\}", raw, flags=re.S)
        if match:
            raw = match.group(0)
        try:
            data = json.loads(raw)
            return LlmJudgeDecision.model_validate(data)
        except (json.JSONDecodeError, ValidationError, TypeError, ValueError):
            return None
