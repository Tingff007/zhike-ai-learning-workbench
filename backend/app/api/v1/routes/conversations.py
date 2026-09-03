from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, ensure_course_access, get_current_user
from app.schemas.conversation import (
    ConversationDeleteResponse,
    ConversationMessageDTO,
    ConversationMessagesResponse,
    ConversationRenameRequest,
    ConversationRenameResponse,
    CourseHistoryResponse,
    HistoryItemDTO,
)
from app.services.conversation.repository import ConversationHistoryEntry, ConversationRepository

router = APIRouter()


def _start_of_day(value: datetime) -> datetime:
    local = value.astimezone(UTC)
    return datetime(local.year, local.month, local.day, tzinfo=UTC)


def _conversation_to_dto(entry: ConversationHistoryEntry) -> HistoryItemDTO:
    return HistoryItemDTO(
        conversation_id=entry.conversation_id,
        title=entry.title,
        updated_at=entry.updated_at,
        first_message_snippet=entry.first_message_snippet,
    )


def _group_conversations(course_id: str, conversations: list[ConversationHistoryEntry]) -> CourseHistoryResponse:
    now = datetime.now(tz=UTC)
    today_start = _start_of_day(now)
    yesterday_start = today_start - timedelta(days=1)

    today_items: list[HistoryItemDTO] = []
    yesterday_items: list[HistoryItemDTO] = []
    older_items: list[HistoryItemDTO] = []

    for entry in conversations:
        updated_at = entry.updated_at.astimezone(UTC) if entry.updated_at.tzinfo else entry.updated_at.replace(tzinfo=UTC)
        dto = _conversation_to_dto(entry)
        if updated_at >= today_start:
            today_items.append(dto)
        elif updated_at >= yesterday_start:
            yesterday_items.append(dto)
        else:
            older_items.append(dto)

    return CourseHistoryResponse(
        course_id=course_id,
        today_items=today_items,
        yesterday_items=yesterday_items,
        older_items=older_items,
    )


@router.get("/conversations", response_model=CourseHistoryResponse)
async def list_conversations(
    course_id: str | None = Query(default=None),
    scope: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CourseHistoryResponse:
    """列出当前用户的课程会话或通用学习会话历史。"""
    repo = ConversationRepository(db)
    if scope == "general":
        rows = repo.list_general_conversations(current_user.id)
        return _group_conversations("general", rows)

    if not course_id:
        raise HTTPException(status_code=400, detail="必须提供 course_id 或使用 scope=general")

    ensure_course_access(db, current_user, course_id)
    course = repo.resolve_course_by_key(course_id)
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在或已被删除")

    rows = repo.list_course_conversations(course, current_user.id)
    grouped = _group_conversations(course.slug, rows)
    return grouped


@router.get("/conversations/{conversation_id}/messages", response_model=ConversationMessagesResponse)
async def list_conversation_messages(
    conversation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationMessagesResponse:
    """列出指定会话的消息和引用来源。"""
    repo = ConversationRepository(db)
    conversation = repo.get_conversation_for_user(conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在或无权访问")

    course = repo.course_for_conversation(conversation)
    if course:
        ensure_course_access(db, current_user, course.slug)

    rows = repo.list_messages(conversation)
    messages = [
        ConversationMessageDTO(
            id=str(message.id),
            role=message.role,
            content=message.content,
            created_at=message.created_at,
            meta_json=message.meta_json or {},
            citations=[
                {
                    "source_title": citation.source_title,
                    "page_no": citation.page_no,
                    "similarity": citation.similarity,
                    "snippet": citation.snippet,
                    "chunk_id": str(citation.document_chunk_id) if citation.document_chunk_id else None,
                }
                for citation in citations
            ],
        )
        for message, citations in rows
    ]
    return ConversationMessagesResponse(conversation_id=str(conversation.id), messages=messages)


@router.patch("/conversations/{conversation_id}", response_model=ConversationRenameResponse)
async def rename_conversation(
    conversation_id: str,
    payload: ConversationRenameRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationRenameResponse:
    """重命名当前用户可访问的会话。"""
    repo = ConversationRepository(db)
    conversation = repo.get_conversation_for_user(conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在或无权访问")

    course = repo.course_for_conversation(conversation)
    if course:
        ensure_course_access(db, current_user, course.slug)

    conversation = repo.rename_conversation(conversation, payload.title)
    return ConversationRenameResponse(id=str(conversation.id), title=conversation.title)


@router.delete("/conversations/{conversation_id}", response_model=ConversationDeleteResponse)
async def delete_conversation(
    conversation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationDeleteResponse:
    """软删除当前用户可访问的会话。"""
    repo = ConversationRepository(db)
    conversation = repo.get_conversation_for_user(conversation_id, current_user.id)
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在或无权访问")

    course = repo.course_for_conversation(conversation)
    if course:
        ensure_course_access(db, current_user, course.slug)

    conversation = repo.delete_conversation(conversation)
    return ConversationDeleteResponse(conversation_id=str(conversation.id))
