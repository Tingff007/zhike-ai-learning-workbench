from __future__ import annotations

from collections import defaultdict
from typing import Protocol

from app.schemas.ai import AiMessageRequest
from app.services.ai.intent.registry import IntentRegistryStore
from app.services.ai.intent.types import IntentEvalMetrics, IntentEvalReport, IntentEvaluationCase, IntentRegistryConfig, IntentRoute


class IntentRouterProtocol(Protocol):
    """离线评测所需的路由器协议。"""

    def classify(self, payload: AiMessageRequest, *, history: list[str] | None = None) -> IntentRoute:
        """同步分类入口。"""


def build_intent_eval_cases(registry: IntentRegistryConfig | None = None) -> list[IntentEvaluationCase]:
    """根据 Intent Registry 展开离线评测集。"""
    active_registry = registry or IntentRegistryStore().load_active()
    cases = list(active_registry.evaluation_cases)
    for template in active_registry.evaluation_templates:
        prefixes = template.prefixes or [""]
        if template.topics and template.templates:
            for prefix in prefixes:
                for topic in template.topics:
                    for item in template.templates:
                        cases.append(
                            IntentEvaluationCase(
                                text=f"{prefix}{item.format(topic=topic)}",
                                expected_intent=template.expected_intent,
                                course_id=template.course_id,
                            )
                        )
        else:
            for prefix in prefixes:
                for question in template.questions:
                    cases.append(
                        IntentEvaluationCase(
                            text=f"{prefix}{question}",
                            expected_intent=template.expected_intent,
                            course_id=template.course_id,
                        )
                    )
    return cases


def evaluate_intent_router(
    router: IntentRouterProtocol | None = None,
    registry: IntentRegistryConfig | None = None,
) -> IntentEvalReport:
    """运行离线评测并返回总体与分意图指标。"""
    active_registry = registry or IntentRegistryStore().load_active()
    if router is None:
        from app.services.ai.intent_router import HybridIntentRouter

        router = HybridIntentRouter(registry=active_registry)

    cases = build_intent_eval_cases(active_registry)
    labels = sorted({case.expected_intent for case in cases} | {item.name for item in active_registry.intents})
    confusion: dict[str, dict[str, int]] = {label: defaultdict(int) for label in labels}
    correct = 0
    clarify_count = 0
    high_risk_false_positive = 0
    risk_by_intent = {item.name: item.risk_level for item in active_registry.intents}

    for case in cases:
        client_context = {"lastIntentRoute": case.last_intent_route} if case.last_intent_route else {}
        payload = AiMessageRequest(message=case.text, course_id=case.course_id, clientContext=client_context)
        predicted_route = router.classify(payload)
        predicted = predicted_route.intent
        if predicted == "general_chat":
            predicted = "default_chat"
        if predicted_route.needs_clarification:
            clarify_count += 1
        confusion[case.expected_intent][predicted] += 1
        if predicted == case.expected_intent:
            correct += 1
        elif risk_by_intent.get(predicted) == "high":
            high_risk_false_positive += 1

    by_intent: dict[str, IntentEvalMetrics] = {}
    for label in labels:
        true_positive = confusion[label][label]
        false_positive = sum(confusion[other][label] for other in labels if other != label)
        false_negative = sum(count for predicted, count in confusion[label].items() if predicted != label)
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        support = sum(confusion[label].values())
        by_intent[label] = IntentEvalMetrics(
            precision=round(precision, 4),
            recall=round(recall, 4),
            false_positive=false_positive,
            false_negative=false_negative,
            support=support,
        )

    total = len(cases)
    return IntentEvalReport(
        total=total,
        correct=correct,
        accuracy=round(correct / total, 4) if total else 0.0,
        clarification_rate=round(clarify_count / total, 4) if total else 0.0,
        high_risk_false_positive=high_risk_false_positive,
        by_intent=by_intent,
    )

