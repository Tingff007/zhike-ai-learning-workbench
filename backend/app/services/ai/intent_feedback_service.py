from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ModelCallLog, User
from app.schemas.ai import IntentRouterFeedbackRequest, IntentRouterFeedbackResponse


class IntentRouterFeedbackService:
    """记录意图路由反馈，供离线评测和样例迭代使用。"""

    def __init__(self, db: Session) -> None:
        """保存数据库会话。"""
        self.db = db

    def record_feedback(
        self,
        payload: IntentRouterFeedbackRequest,
        user_external_id: str,
    ) -> IntentRouterFeedbackResponse:
        """写入一条用户反馈日志，并返回统一响应模型。"""
        user = self.db.execute(select(User).where(User.external_id == user_external_id)).scalar_one_or_none()
        self.db.add(
            ModelCallLog(
                course_id=None,
                user_id=user.id if user else None,
                provider_id=None,
                agent_name="HybridIntentRouter",
                capability="intent_feedback",
                model_name="user_feedback",
                request_count=1,
                latency_ms=0,
                status="correct" if payload.is_correct else "incorrect",
                error_message=None,
                meta_json={
                    "trace_id": payload.trace_id,
                    "conversation_id": payload.conversation_id,
                    "message": payload.message[:500],
                    "predicted_intent": payload.predicted_intent,
                    "expected_intent": payload.expected_intent,
                    "is_correct": payload.is_correct,
                    "comment": payload.comment,
                },
            )
        )
        self.db.commit()
        return IntentRouterFeedbackResponse()
