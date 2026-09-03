from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Conversation, Course, Message, User
from app.models.conversation import AgentTraceEvent as AgentTraceEventModel
from app.models.conversation import MessageCitation
from app.schemas.ai import AgentTraceEvent
from app.schemas.common import Citation


@dataclass(slots=True)
class ConversationHistoryEntry:
    """会话历史列表使用的轻量只读数据，避免 API 路由直接依赖 ORM 模型。"""

    conversation_id: str
    title: str
    updated_at: datetime
    first_message_snippet: str | None


class ConversationRepository:
    """封装会话、消息、引用和 Agent Trace 的数据库读写。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def _resolve_course(self, course_slug: str) -> Course | None:
        return self.db.execute(select(Course).where(Course.slug == course_slug)).scalar_one_or_none()

    def resolve_course_by_key(self, course_id_or_slug: str) -> Course | None:
        """按课程 slug 或 UUID 文本解析未删除课程实体。"""

        clauses = [Course.slug == course_id_or_slug]
        try:
            clauses.append(Course.id == uuid.UUID(str(course_id_or_slug)))
        except ValueError:
            pass
        return self.db.execute(select(Course).where(or_(*clauses), Course.status != "deleted")).scalar_one_or_none()

    def resolve_course(self, course_slug: str) -> Course | None:
        """按课程 slug 解析课程实体，供跨服务协作使用。"""

        return self._resolve_course(course_slug)

    def _resolve_user(self, user_external_id: str) -> User | None:
        return self.db.execute(select(User).where(User.external_id == user_external_id)).scalar_one_or_none()

    def resolve_user(self, user_external_id: str) -> User | None:
        """按外部用户 ID 解析用户实体，供跨服务协作使用。"""

        return self._resolve_user(user_external_id)

    def _get_conversation(
        self,
        conversation_id: str,
        course_id: uuid.UUID | None,
        user_id: uuid.UUID | None,
    ) -> Conversation | None:
        try:
            conversation_uuid = uuid.UUID(str(conversation_id))
        except ValueError:
            return None

        conversation = self.db.get(Conversation, conversation_uuid)
        if not conversation or conversation.status == "deleted":
            return None

        if course_id is None:
            if conversation.course_id is not None:
                return None
            if (conversation.meta_json or {}).get("scope") != "general":
                return None
        elif conversation.course_id != course_id:
            return None

        if user_id and conversation.user_id and conversation.user_id != user_id:
            return None
        return conversation

    def get_conversation_for_scope(
        self,
        conversation_id: str,
        course_id: uuid.UUID | None,
        user_id: uuid.UUID | None,
    ) -> Conversation | None:
        """按课程范围和用户归属读取有效会话。

        参数:
            conversation_id: 前端传入的会话 ID。
            course_id: 课程会话所属课程 ID；通用会话传 None。
            user_id: 当前用户 ID；为空时仅按范围校验。

        返回:
            符合范围和归属要求的有效会话，不存在或已删除时返回 None。
        """

        return self._get_conversation(conversation_id, course_id, user_id)

    def get_conversation_for_user(self, conversation_id: str, user_external_id: str) -> Conversation | None:
        """按会话 ID 和当前用户外部 ID 读取有效会话。

        参数:
            conversation_id: 前端传入的会话 ID。
            user_external_id: 当前登录用户的外部 ID。

        返回:
            当前用户可访问的有效会话；非法 ID、不存在、已删除或归属不匹配时返回 None。
        """

        try:
            conversation_uuid = uuid.UUID(str(conversation_id))
        except ValueError:
            return None
        user = self._resolve_user(user_external_id)
        conversation = self.db.get(Conversation, conversation_uuid)
        if not conversation or conversation.status == "deleted":
            return None
        if user and conversation.user_id and conversation.user_id != user.id:
            return None
        return conversation

    def course_for_conversation(self, conversation: Conversation) -> Course | None:
        """读取会话关联课程；通用会话或课程缺失时返回 None。"""

        if conversation.course_id is None:
            return None
        return self.db.get(Course, conversation.course_id)

    def list_general_conversations(self, user_external_id: str) -> list[ConversationHistoryEntry]:
        """列出当前用户可见的通用学习会话及首条用户消息摘要。"""

        user = self._resolve_user(user_external_id)
        query = select(Conversation).where(
            Conversation.course_id.is_(None),
            Conversation.status != "deleted",
        )
        if user:
            query = query.where((Conversation.user_id.is_(None)) | (Conversation.user_id == user.id))
        conversations = self.db.execute(query.order_by(Conversation.updated_at.desc()).limit(50)).scalars().all()
        rows: list[ConversationHistoryEntry] = []
        for conversation in conversations:
            if (conversation.meta_json or {}).get("scope") != "general":
                continue
            rows.append(self._conversation_history_entry(conversation))
        return rows

    def list_course_conversations(self, course: Course, user_external_id: str) -> list[ConversationHistoryEntry]:
        """列出当前用户可见的课程会话及首条用户消息摘要。"""

        user = self._resolve_user(user_external_id)
        query = select(Conversation).where(
            Conversation.course_id == course.id,
            Conversation.status != "deleted",
        )
        if user:
            query = query.where((Conversation.user_id.is_(None)) | (Conversation.user_id == user.id))
        conversations = self.db.execute(query.order_by(Conversation.updated_at.desc()).limit(50)).scalars().all()
        return [self._conversation_history_entry(conversation) for conversation in conversations]

    def _conversation_history_entry(self, conversation: Conversation) -> ConversationHistoryEntry:
        """将会话 ORM 转为历史列表轻量数据对象。"""

        return ConversationHistoryEntry(
            conversation_id=str(conversation.id),
            title=conversation.title,
            updated_at=conversation.updated_at,
            first_message_snippet=self._first_user_message_snippet(conversation),
        )

    def _first_user_message_snippet(self, conversation: Conversation) -> str | None:
        """读取会话第一条用户消息并裁剪为侧边栏摘要。"""

        first_message = self.db.execute(
            select(Message.content)
            .where(Message.conversation_id == conversation.id, Message.role == "user")
            .order_by(Message.created_at.asc())
            .limit(1)
        ).scalar_one_or_none()
        return first_message[:120] if first_message else None

    def get_or_create_general_conversation(
        self,
        *,
        user_external_id: str,
        conversation_id: str | None = None,
        title: str | None = None,
    ) -> Conversation:
        """获取或创建通用学习场景的会话。"""

        user = self._resolve_user(user_external_id)
        if conversation_id:
            existing = self._get_conversation(conversation_id, None, user.id if user else None)
            if existing:
                return existing

        conversation = Conversation(
            course_id=None,
            user_id=user.id if user else None,
            title=(title or "通用学习对话")[:255],
            status="active",
            meta_json={"scope": "general"},
        )
        self.db.add(conversation)
        self.db.flush()
        return conversation

    def get_or_create_conversation(
        self,
        *,
        course_slug: str,
        user_external_id: str,
        conversation_id: str | None = None,
        title: str | None = None,
    ) -> Conversation:
        """获取或创建指定课程下的学习会话。"""

        course = self._resolve_course(course_slug)
        if not course:
            raise ValueError(f"课程不存在：{course_slug}")

        user = self._resolve_user(user_external_id)
        if conversation_id:
            existing = self._get_conversation(conversation_id, course.id, user.id if user else None)
            if existing:
                return existing

        conversation = Conversation(
            course_id=course.id,
            user_id=user.id if user else None,
            title=(title or "课程对话")[:255],
            status="active",
            meta_json={"scope": "course"},
        )
        self.db.add(conversation)
        self.db.flush()
        return conversation

    def append_message(
        self,
        conversation: Conversation,
        role: str,
        content: str,
        meta_json: dict | None = None,
    ) -> Message:
        """向会话追加一条消息并刷新主键。"""

        message = Message(
            conversation_id=conversation.id,
            role=role,
            content=content,
            meta_json=meta_json or {},
        )
        self.db.add(message)
        self.db.flush()
        return message

    def append_citations(self, message: Message, citations: list[Citation]) -> None:
        """把回答引用写入消息引用表，非法切片 ID 会被安全忽略。"""

        for citation in citations:
            chunk_uuid = None
            if citation.chunk_id:
                try:
                    chunk_uuid = uuid.UUID(str(citation.chunk_id))
                except ValueError:
                    chunk_uuid = None
            self.db.add(
                MessageCitation(
                    message_id=message.id,
                    document_chunk_id=chunk_uuid,
                    source_title=citation.source_title,
                    page_no=citation.page_no,
                    similarity=citation.similarity,
                    snippet=citation.snippet,
                )
            )

    def append_trace(
        self,
        conversation: Conversation,
        message: Message | None,
        trace: list[AgentTraceEvent],
        start_index: int = 0,
    ) -> None:
        """追加 Agent 执行轨迹，保留顺序和耗时等排障信息。"""

        for index, event in enumerate(trace):
            payload_json: dict = {}
            if event.duration_ms is not None:
                payload_json["duration_ms"] = event.duration_ms
            self.db.add(
                AgentTraceEventModel(
                    conversation_id=conversation.id,
                    message_id=message.id if message else None,
                    step=event.step,
                    status=event.status,
                    detail=event.detail,
                    order_index=start_index + index,
                    payload_json=payload_json,
                )
            )

    def list_messages(self, conversation: Conversation) -> list[tuple[Message, list[MessageCitation]]]:
        """按时间顺序列出会话消息及其引用。"""

        messages = self.db.execute(
            select(Message).where(Message.conversation_id == conversation.id).order_by(Message.created_at.asc())
        ).scalars().all()
        rows: list[tuple[Message, list[MessageCitation]]] = []
        for message in messages:
            citations = self.db.execute(
                select(MessageCitation).where(MessageCitation.message_id == message.id).order_by(MessageCitation.created_at.asc())
            ).scalars().all()
            rows.append((message, list(citations)))
        return rows

    def rename_conversation(self, conversation: Conversation, title: str) -> Conversation:
        """重命名会话并提交事务。

        参数:
            conversation: 已完成权限校验的会话实体。
            title: 用户提交的新标题，方法内部会统一去除首尾空白。

        返回:
            刷新后的会话实体，包含数据库确认的最新字段值。
        """

        conversation.title = title.strip()
        self.db.add(conversation)
        self.db.commit()
        self.db.refresh(conversation)
        return conversation

    def delete_conversation(self, conversation: Conversation) -> Conversation:
        """软删除会话并提交事务。

        参数:
            conversation: 已完成权限校验的会话实体。

        返回:
            已标记为删除状态的会话实体。
        """

        conversation.status = "deleted"
        self.db.add(conversation)
        self.db.commit()
        return conversation

    def commit(self) -> None:
        """提交当前会话仓储累积的数据库事务。"""

        self.db.commit()
