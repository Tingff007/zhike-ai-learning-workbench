from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import ChatdocExtractedQa, Course, Document


class ExtractedQaRepository:
    """ChatDoc 萃取问答的数据库仓储。

    用途:
        封装萃取问答的课程查询、批量写入和相关推荐读取逻辑。

    副作用/失败:
        方法会通过传入的数据库会话读取或写入 ChatdocExtractedQa；数据库异常由 SQLAlchemy 向上抛出。
    """

    def __init__(self, db: Session) -> None:
        """初始化萃取问答仓储。

        参数:
            db: SQLAlchemy 会话，由调用方负责事务提交和关闭。

        返回:
            None。

        副作用/失败:
            仅保存会话引用，不主动访问数据库。
        """
        self.db = db

    def _course(self, course_id_or_slug: str) -> Course | None:
        clauses = [Course.slug == course_id_or_slug]
        try:
            clauses.append(Course.id == uuid.UUID(course_id_or_slug))
        except ValueError:
            pass
        return self.db.execute(select(Course).where(or_(*clauses))).scalar_one_or_none()

    def list_for_course(
        self,
        course_slug: str,
        *,
        limit: int = 12,
        exclude_ids: list[uuid.UUID] | None = None,
    ) -> list[dict]:
        """列出课程下最近更新的萃取问答。

        参数:
            course_slug: 课程 slug 或可解析为 UUID 的课程标识。
            limit: 返回数量上限，会被限制在 1 到 50 之间。
            exclude_ids: 可选排除的问答 ID 列表。

        返回:
            序列化后的问答字典列表；课程不存在时返回空列表。

        副作用/失败:
            只读取数据库，不修改状态；数据库查询失败时抛出 SQLAlchemy 异常。
        """
        course = self._course(course_slug)
        if not course:
            return []
        query = (
            select(ChatdocExtractedQa)
            .where(ChatdocExtractedQa.course_id == course.id)
            .order_by(ChatdocExtractedQa.updated_at.desc())
            .limit(max(1, min(limit, 50)))
        )
        if exclude_ids:
            query = query.where(ChatdocExtractedQa.id.not_in(exclude_ids))
        rows = self.db.execute(query).scalars().all()
        return [self._serialize(row) for row in rows]

    def get_by_id(self, qa_id: uuid.UUID) -> dict | None:
        """按主键读取单条萃取问答。

        参数:
            qa_id: 萃取问答记录 UUID。

        返回:
            找到时返回序列化问答字典，否则返回 None。

        副作用/失败:
            只读取数据库，不修改状态；数据库查询失败时抛出 SQLAlchemy 异常。
        """
        row = self.db.get(ChatdocExtractedQa, qa_id)
        return self._serialize(row) if row else None

    def upsert_batch(
        self,
        *,
        course_id: uuid.UUID,
        document_id: uuid.UUID,
        iflytek_file_id: str,
        items: list[dict],
    ) -> int:
        """批量写入或更新 ChatDoc 萃取问答。

        参数:
            course_id: 问答所属课程 UUID。
            document_id: 问答来源文档 UUID。
            iflytek_file_id: 讯飞 ChatDoc fileId，用于追踪云端来源。
            items: 供应商返回或上游整理后的问答字典列表。

        返回:
            实际写入或更新的有效问答数量；缺少问题文本的条目会被跳过。

        副作用/失败:
            会向当前数据库会话添加或修改 ChatdocExtractedQa，但不提交事务；数据库异常由调用方处理。
        """
        written = 0
        for item in items:
            question = str(item.get("question") or item.get("q") or "").strip()
            if not question:
                continue
            answer = str(item.get("answer") or item.get("a") or "").strip()
            vendor_qa_id = str(item.get("id") or item.get("qaId") or item.get("vendor_qa_id") or "").strip() or None
            existing = None
            if vendor_qa_id:
                existing = self.db.execute(
                    select(ChatdocExtractedQa).where(
                        ChatdocExtractedQa.document_id == document_id,
                        ChatdocExtractedQa.vendor_qa_id == vendor_qa_id,
                    )
                ).scalar_one_or_none()
            if existing:
                existing.question = question
                existing.answer = answer
            else:
                self.db.add(
                    ChatdocExtractedQa(
                        course_id=course_id,
                        document_id=document_id,
                        iflytek_file_id=iflytek_file_id,
                        vendor_qa_id=vendor_qa_id,
                        question=question,
                        answer=answer,
                    )
                )
            written += 1
        return written

    def related_suggestions(
        self,
        course_slug: str,
        *,
        limit: int = 3,
        exclude_question: str | None = None,
    ) -> list[dict]:
        """获取同课程下的相关问答建议。

        参数:
            course_slug: 课程 slug 或课程标识，用于限定问答范围。
            limit: 最多返回的建议数量。
            exclude_question: 可选问题文本，匹配后会从建议中排除。

        返回:
            序列化后的问答建议列表。

        副作用/失败:
            只读取数据库，不修改状态；底层查询失败时抛出 SQLAlchemy 异常。
        """
        items = self.list_for_course(course_slug, limit=limit + 5)
        if exclude_question:
            lowered = exclude_question.strip().lower()
            items = [item for item in items if item["question"].strip().lower() != lowered]
        return items[:limit]

    @staticmethod
    def _serialize(row: ChatdocExtractedQa) -> dict:
        return {
            "id": str(row.id),
            "course_id": str(row.course_id),
            "document_id": str(row.document_id),
            "iflytek_file_id": row.iflytek_file_id,
            "question": row.question,
            "answer": row.answer,
        }
