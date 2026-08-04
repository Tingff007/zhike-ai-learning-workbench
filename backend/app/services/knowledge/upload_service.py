from __future__ import annotations

import hashlib
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.tracing import get_trace_id
from app.models import Document
from app.services.knowledge.document_storage import save_document_file
from app.services.knowledge.iflytek.client import IflytekChatDocError
from app.services.knowledge.iflytek.document_service import IflytekDocumentService
from app.services.knowledge.iflytek.status_sync import schedule_chatdoc_status_sync
from app.services.knowledge.repository import KnowledgeRepository
from app.services.knowledge.upload_payloads import build_chatdoc_upload_payload
from app.services.knowledge.upload_validation import DocumentUploadValidationError, validate_document_upload_bytes

logger = logging.getLogger(__name__)


class KnowledgeUploadError(ValueError):
    """知识库上传服务错误，由 API 层统一映射为 HTTP 响应。

    参数:
        detail: 返回给调用方的安全错误详情，可为字符串或结构化字典。
        status_code: 建议 API 层映射的 HTTP 状态码。
    """

    def __init__(self, detail: str | dict[str, Any], *, status_code: int = 400) -> None:
        super().__init__(detail if isinstance(detail, str) else str(detail))
        self.detail = detail
        self.status_code = status_code


class KnowledgeUploadService:
    """封装知识库文档上传、去重、云端入库和状态同步流程。

    参数:
        db: 当前请求范围内的数据库会话。
    """

    def __init__(self, db: Session) -> None:
        """初始化上传服务及其知识库仓储。"""
        self.db = db
        self.repository = KnowledgeRepository(db)

    async def upload_chatdoc_document(
        self,
        *,
        course_id: str,
        filename: str,
        mime_type: str | None,
        content: bytes,
        user_external_id: str | None,
        integration_key: str | None = None,
        upload_stage_body: dict[str, Any] | None = None,
        force_reupload: bool = False,
    ) -> dict[str, Any]:
        """上传文档到讯飞 ChatDoc，并返回管理端需要的入库状态 payload。

        参数:
            course_id: 课程 slug。
            filename: 用户上传文件名。
            mime_type: 上传文件 MIME 类型。
            content: 上传文件二进制内容。
            user_external_id: 当前操作用户的外部用户 ID。
            integration_key: 可选的云端知识库集成配置 key。
            upload_stage_body: 可选的 ChatDoc 上传阶段配置覆盖。
            force_reupload: 是否跳过同名和同内容重复上传拦截。

        返回:
            包含本地文档 ID、云端 fileId/repoId、状态和提示文案的字典。

        抛出:
            KnowledgeUploadError: 上传校验、重复检测、本地保存、文档登记或云端上传失败。
        """
        if settings.RAG_BACKEND != "iflytek_chatdoc":
            raise KnowledgeUploadError(
                "当前仅支持云端知识库入库，请设置 RAG_BACKEND=iflytek_chatdoc。",
                status_code=503,
            )

        self._validate_document(filename, mime_type, content)
        content_hash = hashlib.sha256(content).hexdigest()
        self._ensure_no_duplicate(course_id, filename, content_hash, force_reupload=force_reupload)
        file_uri = self._save_local_file(course_id, filename, content, content_hash)
        record = self.repository.create_document_record(
            course_slug=course_id,
            filename=filename,
            mime_type=mime_type,
            user_external_id=user_external_id,
            file_uri=file_uri,
            content_hash=content_hash,
            ingestion_options={"rag_backend": "iflytek_chatdoc"},
        )
        document = self._resolve_created_document(record)

        try:
            chatdoc = await IflytekDocumentService(
                self.db,
                integration_key=integration_key,
            ).upload_to_chatdoc(
                course_slug=course_id,
                filename=filename,
                content=content,
                document=document,
                mime_type=mime_type,
                upload_stage_body=upload_stage_body,
            )
        except IflytekChatDocError as exc:
            document.parse_status = "failed"
            document.vector_status = "failed"
            self.db.flush()
            self.db.commit()
            logger.warning(
                "ChatDoc 文档上传失败：course_id=%s filename=%s document_id=%s trace_id=%s error=%s",
                course_id,
                filename,
                document.id,
                get_trace_id(),
                exc,
                exc_info=True,
            )
            raise KnowledgeUploadError(str(exc), status_code=502) from exc

        schedule_chatdoc_status_sync(str(document.id))
        payload = build_chatdoc_upload_payload(record, chatdoc)
        self.repository.record_admin_audit(
            user_external_id,
            "document.upload.chatdoc",
            "course",
            course_id,
            {"document_id": payload.get("document_id")},
        )
        self.db.commit()
        return payload

    def _validate_document(self, filename: str, mime_type: str | None, content: bytes) -> None:
        """执行上传文件扩展名、MIME 类型和大小校验。"""
        try:
            validate_document_upload_bytes(filename, mime_type, content)
        except DocumentUploadValidationError as exc:
            raise KnowledgeUploadError(str(exc), status_code=exc.status_code) from exc

    def _ensure_no_duplicate(
        self,
        course_id: str,
        filename: str,
        content_hash: str,
        *,
        force_reupload: bool,
    ) -> None:
        """根据文件名和内容哈希拦截同课重复上传。"""
        duplicate_name = self.repository.find_active_duplicate_filename(course_id, filename)
        if duplicate_name and settings.BLOCK_DUPLICATE_FILENAME and not force_reupload:
            raise self._duplicate_upload_error(
                code="duplicate_filename",
                message=(
                    f"本课程已有同名文档「{duplicate_name.filename or duplicate_name.title}」，"
                    f"无需重复上传。若确需再次入库，请勾选「强制重新上传」。"
                ),
                duplicate=duplicate_name,
            )

        duplicate = self.repository.find_active_duplicate_document(course_id, content_hash)
        if duplicate and settings.BLOCK_DUPLICATE_DOCUMENT_UPLOAD and not force_reupload:
            raise self._duplicate_upload_error(
                code="duplicate_content",
                message=(
                    f"本课程已存在相同内容的文档「{duplicate.filename or duplicate.title}」，"
                    f"无需重复上传。若确需再次入库，请勾选「强制重新上传」。"
                ),
                duplicate=duplicate,
            )

    def _save_local_file(self, course_id: str, filename: str, content: bytes, content_hash: str) -> str:
        """把上传内容写入本地对象存储并返回文件 URI。"""
        try:
            return save_document_file(
                course_slug=course_id,
                filename=filename,
                content=content,
                content_hash=content_hash,
            )
        except OSError as exc:
            logger.exception(
                "知识库上传本地保存失败：course_id=%s filename=%s",
                course_id,
                filename,
            )
            raise KnowledgeUploadError("文档本地保存失败，请稍后重试。", status_code=500) from exc

    def _resolve_created_document(self, record: dict[str, Any]) -> Document:
        """从登记结果中解析刚创建的文档实体。"""
        document_id = record.get("document_id")
        if not document_id:
            raise KnowledgeUploadError(record.get("message") or "文档登记失败", status_code=400)

        document = self.db.get(Document, document_id)
        if not document:
            raise KnowledgeUploadError("文档记录创建失败", status_code=500)
        return document

    @staticmethod
    def _duplicate_upload_error(*, code: str, message: str, duplicate: Document) -> KnowledgeUploadError:
        """构造重复上传错误详情，供前端展示冲突文档信息。"""
        return KnowledgeUploadError(
            {
                "code": code,
                "message": message,
                "duplicate_document_id": str(duplicate.id),
                "duplicate_filename": duplicate.filename or duplicate.title,
            },
            status_code=409,
        )
