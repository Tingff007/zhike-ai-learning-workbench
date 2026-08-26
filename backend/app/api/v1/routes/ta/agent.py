"""助教端 AI Agent 对话路由。

对外暴露 ``POST /ta/agent/messages``：教师以自然语言提问，Agent 基于本地知识库
检索回答（零幻觉防线），或读取教师名下班级/作业/成绩真实数据返回可核验事实。
仅 ta/admin 角色可访问；会话轮次写入 conversations 表用于历史回溯。
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_ta
from app.core.rate_limit import RateLimitExceeded, check_chat_rate_limit
from app.models import User
from app.schemas.ta_agent import TaAgentMessageRequest, TaAgentMessageResponse
from app.services.conversation.repository import ConversationRepository
from app.services.ta.agent import TaAgentOrchestratorService

router = APIRouter(prefix="/ta", tags=["ta-portal"])

logger = logging.getLogger(__name__)

agent_service = TaAgentOrchestratorService()


@router.post("/agent/messages", response_model=TaAgentMessageResponse)
async def ta_agent_messages(
    payload: TaAgentMessageRequest,
    current_user: CurrentUser = Depends(require_ta),
    db: Session = Depends(get_db),
) -> TaAgentMessageResponse:
    """处理教师端 Agent 对话消息：限流 → 编排 → 会话持久化。"""
    try:
        check_chat_rate_limit(current_user.id, "ta_agent")
    except RateLimitExceeded as exc:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=429,
            detail={"message": "AI 对话请求过于频繁", "scope": exc.scope, "retry_after_seconds": exc.retry_after_seconds},
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc

    response = await agent_service.handle_message(payload, db, current_user.id)
    _persist_ta_turn(db, current_user.id, payload, response)
    return response


def _persist_ta_turn(
    db: Session,
    user_external_id: str,
    payload: TaAgentMessageRequest,
    response: TaAgentMessageResponse,
) -> None:
    """把教师端 Agent 一轮对话写入通用会话，失败不影响主流程返回。"""
    try:
        repo = ConversationRepository(db)
        conversation = repo.get_or_create_general_conversation(
            user_external_id=user_external_id,
            conversation_id=response.conversation_id,
            title=payload.message[:120] if payload.message else None,
        )
        user = db.execute(select(User).where(User.external_id == user_external_id)).scalar_one_or_none()
        if user is None:
            return
        repo.append_message(conversation, "user", payload.message, {"scope": "ta_agent"})
        assistant_message = repo.append_message(
            conversation,
            "assistant",
            response.answer,
            {
                "scope": "ta_agent",
                "route": response.route,
                "refused": response.refused,
                "refusal_reason": response.refusal_reason,
                "model_meta": {},
            },
        )
        repo.append_citations(assistant_message, response.citations)
        repo.append_trace(conversation, assistant_message, response.agent_trace)
        repo.commit()
    except Exception:  # noqa: BLE001 - 会话持久化失败不应阻断回答返回
        logger.debug("教师端 Agent 会话持久化失败：trace 保留在响应中", exc_info=True)
        db.rollback()
