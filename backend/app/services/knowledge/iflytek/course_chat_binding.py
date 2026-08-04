"""课程与讯飞 ChatDoc 知识库绑定的轻量查询 helper。"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Course
from app.services.knowledge.iflytek.client_factory import chatdoc_client_for_db
from app.services.knowledge.iflytek.config_service import ChatdocConfigService
from app.services.knowledge.iflytek.file_resolver import ChatdocFileResolver
from app.services.knowledge.iflytek.pipeline_config import doc_qa_payload_from_pipeline


@dataclass(frozen=True)
class CourseChatdocBinding:
    """课程侧 ChatDoc 知识库就绪状态的只读快照。

    字段名保留当前 API 契约中的英文名称，便于路由层和前端透传时保持一致。
    """

    course_id: str
    course_title: str
    knowledge_ready: bool
    primary_file_id: str | None
    file_ids: list[str]
    integration_key: str
    spark_version: str | None
    qa_mode: str | None
    ready_document_count: int
    blocking_reason: str | None = None
    require_citation_for_course_answer: bool = True
    default_use_course_evidence_for_resource: bool = True


def _normalize_spark_version(raw: object) -> str | None:
    """将 pipeline 中的 spark 配置规范化为 ChatDoc 版本文本。"""
    if raw is True:
        return "ultra"
    if raw is False or raw is None:
        return None
    text = str(raw).strip()
    return text or None


def _resolve_course(db: Session, course_id_or_slug: str) -> Course | None:
    """按课程 slug 或 UUID 字符串查找课程。"""
    clauses = [Course.slug == course_id_or_slug]
    try:
        clauses.append(Course.id == uuid.UUID(course_id_or_slug))
    except ValueError:
        pass
    return db.execute(select(Course).where(or_(*clauses))).scalar_one_or_none()


def resolve_course_chatdoc_binding(
    db: Session,
    course_slug: str,
    *,
    concept_code: str | None = None,
    document_id: str | None = None,
    integration_key: str | None = None,
) -> CourseChatdocBinding | None:
    """解析课程当前可用的 ChatDoc 绑定信息。

    参数:
        db: 当前请求使用的数据库会话。
        course_slug: 课程 slug 或 UUID 字符串。
        concept_code: 可选的知识点编码过滤条件。
        document_id: 可选的文档 ID 过滤条件。
        integration_key: 可选的 ChatDoc 集成模板键；为空时使用当前激活模板。

    返回:
        找到课程时返回课程知识库绑定快照；课程不存在时返回 None。
    """
    course = _resolve_course(db, course_slug)
    if not course:
        return None

    config_service = ChatdocConfigService(db)
    active_key = integration_key or config_service.active_template_key()
    client = chatdoc_client_for_db(db, integration_key=active_key)
    pipeline = config_service.pipeline_config(active_key)

    resolver = ChatdocFileResolver(db)
    documents, _ = resolver.filter_documents(
        resolver.ready_documents(course),
        course,
        concept_code=concept_code,
        document_id=document_id,
    )
    file_ids = resolver.file_ids(documents)
    primary_file_id = file_ids[0] if file_ids else None

    qa_body = doc_qa_payload_from_pipeline(pipeline, file_id=primary_file_id or "", query="")
    extends = qa_body.get("chatExtends") if isinstance(qa_body.get("chatExtends"), dict) else {}
    spark_version = _normalize_spark_version(extends.get("spark"))
    qa_mode = str(extends.get("qaMode")).strip() if extends.get("qaMode") else None

    configured = client.configured
    knowledge_ready = bool(configured and file_ids)
    blocking_reason: str | None = None
    if not configured:
        blocking_reason = "讯飞知识库凭证未配置"
    elif not file_ids:
        blocking_reason = "当前课程尚无已向量化文档"

    config = course.model_config_json or {}
    return CourseChatdocBinding(
        course_id=course.slug,
        course_title=course.title,
        knowledge_ready=knowledge_ready,
        primary_file_id=primary_file_id,
        file_ids=file_ids,
        integration_key=active_key,
        spark_version=spark_version,
        qa_mode=qa_mode or "MIX",
        ready_document_count=len(documents),
        blocking_reason=blocking_reason,
        require_citation_for_course_answer=bool(config.get("require_citation_for_course_answer", True)),
        default_use_course_evidence_for_resource=bool(config.get("default_use_course_evidence_for_resource", True)),
    )


def course_ai_context_payload(binding: CourseChatdocBinding) -> dict[str, object]:
    """将课程 ChatDoc 绑定快照转换为 AI 上下文响应 payload。

    参数:
        binding: 已解析的课程知识库绑定快照。

    返回:
        面向前端和 AI 编排层的课程知识库上下文字典。
    """
    return {
        "course_id": binding.course_id,
        "course_title": binding.course_title,
        "knowledge_ready": binding.knowledge_ready,
        "chat_input_enabled": binding.knowledge_ready,
        "primary_file_id": binding.primary_file_id,
        "file_ids_count": len(binding.file_ids),
        "integration_key": binding.integration_key,
        "spark_version": binding.spark_version,
        "qa_mode": binding.qa_mode,
        "rag_backend": settings.RAG_BACKEND,
        "require_citation_for_course_answer": binding.require_citation_for_course_answer,
        "default_use_course_evidence_for_resource": binding.default_use_course_evidence_for_resource,
        "blocking_reason": binding.blocking_reason,
        "status_label": (
            f"{binding.course_title} · 知识库已就绪"
            if binding.knowledge_ready
            else (binding.blocking_reason or "知识库未就绪")
        ),
    }
