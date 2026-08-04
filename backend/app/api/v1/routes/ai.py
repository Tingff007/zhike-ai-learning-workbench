from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, ensure_course_access, get_current_user
from app.core.rate_limit import RateLimitExceeded, check_chat_rate_limit
from app.schemas.ai import (
    AiMessageRequest,
    AiMessageResponse,
    ChatRequest,
    ChatResponse,
    ChatStopResponse,
    IntentRouterFeedbackRequest,
    IntentRouterFeedbackResponse,
)
from app.services.ai.intent_feedback_service import IntentRouterFeedbackService
from app.services.ai.orchestrator import AiOrchestratorService
from app.services.agent.workflow import AgentWorkflow

router = APIRouter()
workflow = AgentWorkflow()
orchestrator = AiOrchestratorService(workflow)


def _rate_limit_key(payload: AiMessageRequest) -> str:
    """生成 AI 请求限流维度。"""
    return payload.course_id if payload.learning_scope == "course" and payload.course_id else "general"


async def _check_rate_limit(current_user: CurrentUser, payload: AiMessageRequest) -> None:
    """执行统一 AI 请求限流检查。"""
    try:
        check_chat_rate_limit(current_user.id, _rate_limit_key(payload))
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail={"message": "AI 对话请求过于频繁", "scope": exc.scope, "retry_after_seconds": exc.retry_after_seconds},
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc


@router.post("/messages", response_model=AiMessageResponse)
async def messages(
    payload: AiMessageRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AiMessageResponse:
    """处理 AI 对话消息，包含课程权限校验、限流和编排调用。"""
    if payload.course_id:
        ensure_course_access(db, current_user, payload.course_id)
    await _check_rate_limit(current_user, payload)
    return await orchestrator.handle_message(payload, db, current_user.id)


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatResponse:
    """兼容旧版聊天接口，并转换为统一 AI 消息请求。"""
    message_payload = AiMessageRequest(
        course_id=payload.course_id,
        learning_scope=payload.learning_scope,
        conversation_id=payload.conversation_id,
        message=payload.message,
        concept_id=payload.concept_id,
        path_node_id=payload.path_node_id,
        mode="course_rag_qa" if payload.intent_type in {"COURSE_RAG_QA", "KNOWLEDGE_QA"} else "default_chat",
        action_type="resource_generation" if payload.intent_type == "RESOURCE_GENERATION" else "chat",
        resource_type=payload.preferred_resource_type,
        need_course_evidence=payload.intent_type in {"COURSE_RAG_QA", "KNOWLEDGE_QA"} or payload.require_citations,
        response_mode=payload.response_mode,
        require_citations=payload.require_citations,
        auto_generate_resource=payload.auto_generate_resource,
        preferred_resource_type=payload.preferred_resource_type,
        intent_type=payload.intent_type,
    )
    result = await messages(message_payload, current_user=current_user, db=db)
    return ChatResponse(
        conversation_id=result.conversation_id,
        answer=result.answer,
        citations=result.citations,
        agent_trace=result.agent_trace,
        suggested_actions=result.suggested_actions,
        quality=result.quality,
        resource_task_id=result.resource_task_id,
    )


@router.post("/chat/stop", response_model=ChatStopResponse)
async def stop_chat(
    conversation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> ChatStopResponse:
    """停止指定会话的流式输出。"""
    return ChatStopResponse(conversation_id=conversation_id)


@router.post("/router-feedback", response_model=IntentRouterFeedbackResponse)
async def router_feedback(
    payload: IntentRouterFeedbackRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IntentRouterFeedbackResponse:
    """记录意图路由反馈，供离线评测和路由样例迭代使用。"""
    return IntentRouterFeedbackService(db).record_feedback(payload, current_user.id)
