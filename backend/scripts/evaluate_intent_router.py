from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.ai.intent_router_eval import evaluate_intent_router


def main() -> None:
    """输出 HybridIntentRouter 离线评测报告。"""
    report = evaluate_intent_router()
    payload = {
        "total": report.total,
        "correct": report.correct,
        "accuracy": report.accuracy,
        "by_intent": {
            intent: {
                "precision": metrics.precision,
                "recall": metrics.recall,
                "false_positive": metrics.false_positive,
                "false_negative": metrics.false_negative,
                "support": metrics.support,
            }
            for intent, metrics in report.by_intent.items()
        },
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
