from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.core.tracing import get_trace_id
from app.services.knowledge.iflytek.client import IflytekChatDocError
from app.services.knowledge.iflytek.document_service import IflytekDocumentService
from app.services.knowledge.iflytek.native_chunk_revision import NativeChunkRevisionService
from app.services.knowledge.iflytek.native_chunk_sync import ChatdocNativeChunkSync
from app.services.knowledge.repository import KnowledgeRepository

logger = logging.getLogger(__name__)


class KnowledgeAdminMutationService:
    """封装知识库管理端写操作的审计和事务边界。"""

    def __init__(self, db: Session) -> None:
        """初始化知识库管理端写操作服务。"""

        self.db = db
        self.repository = KnowledgeRepository(db)

    async def sync_native_chunks(
        self,
        document_id: str,
        actor_external_id: str | None,
    ) -> dict[str, Any] | None:
        """全量同步 ChatDoc 原生切片，并写入审计日志。

        参数:
            document_id: 目标文档 ID。
            actor_external_id: 当前操作人的外部用户 ID；系统任务可传 None。

        返回:
            同步成功时返回同步统计；文档不存在时返回 None。

        副作用/失败模式:
            会调用 ChatDoc file/chunks，覆盖写入本地切片并提交事务；文档缺少 fileId 时抛出 ValueError，
            云端调用失败时抛出 IflytekChatDocError。
        """

        document = self.repository.get_active_document(document_id)
        if not document:
            return None
        file_id = str((document.meta_json or {}).get("iflytek_file_id") or "")
        if not file_id:
            raise ValueError("该文档未绑定云端知识库 fileId")
        service = IflytekDocumentService(self.db)
        result = await ChatdocNativeChunkSync(self.db, service).pull_and_persist(document)
        self.repository.record_admin_audit(
            actor_external_id,
            "document.native_chunks.sync",
            "document",
            document_id,
            result,
        )
        self.db.commit()
        return result

    async def resplit_native_chunks(
        self,
        document_id: str,
        *,
        split_body: dict[str, Any],
        sync_after: bool,
        integration_key: str | None,
        actor_external_id: str | None,
    ) -> dict[str, Any] | None:
        """调用 ChatDoc 重切文档，并在需要时自动同步原生切片。

        参数:
            document_id: 目标文档 ID。
            split_body: 传给 ChatDoc file/split 的切分配置。
            sync_after: 是否在提交重切后立即尝试同步本地切片。
            integration_key: 可选 RAG 接入实例 key。
            actor_external_id: 当前操作人的外部用户 ID；系统任务可传 None。

        返回:
            提交成功时返回 vendor 响应和可选同步结果；文档不存在时返回 None。

        副作用/失败模式:
            会调用 ChatDoc file/split，并按既有语义在自动同步失败时记录告警后降级返回 error；
            文档缺少 fileId 时抛出 ValueError，重切提交失败时抛出 IflytekChatDocError。
        """

        document = self.repository.get_active_document(document_id)
        if not document:
            return None
        file_id = str((document.meta_json or {}).get("iflytek_file_id") or "")
        if not file_id:
            raise ValueError("该文档未绑定云端知识库 fileId")

        service = IflytekDocumentService(self.db, integration_key=integration_key)
        vendor = await service.resplit_file(file_id, split_body)
        sync_result = None
        if sync_after:
            from app.services.knowledge.iflytek.status_sync import schedule_chatdoc_status_sync

            schedule_chatdoc_status_sync(str(document.id))
            try:
                sync_result = await ChatdocNativeChunkSync(self.db, service).pull_and_persist(
                    document,
                    revision_source="resplit",
                )
            except (IflytekChatDocError, ValueError) as exc:
                logger.warning(
                    "ChatDoc 原生切片重切后自动同步失败：document_id=%s trace_id=%s",
                    document_id,
                    get_trace_id(),
                    exc_info=True,
                )
                sync_result = {"error": str(exc)}

        result = {"status": "submitted", "vendor": vendor, "sync": sync_result}
        self.repository.record_admin_audit(
            actor_external_id,
            "document.native_chunks.resplit",
            "document",
            document_id,
            {"vendor": vendor, "sync": sync_result},
        )
        self.db.commit()
        return result

    def update_native_chunk(
        self,
        chunk_id: str,
        *,
        content: str | None,
        tags: list[str] | None,
        page_no: int | None,
        actor_external_id: str | None,
    ) -> dict[str, Any] | None:
        """人工修订本地原生切片，并写入审计日志。

        参数:
            chunk_id: 待修订的切片 ID。
            content: 可选的新切片正文。
            tags: 可选的新标签列表。
            page_no: 可选的新页码。
            actor_external_id: 当前操作人的外部用户 ID；系统任务可传 None。

        返回:
            修订成功时返回切片详情；切片不存在或不是原生切片时返回 None。
        """

        item = ChatdocNativeChunkSync(self.db).update_chunk_by_id(
            chunk_id,
            content=content,
            tags=tags,
            page_no=page_no,
        )
        if not item:
            return None
        self.repository.record_admin_audit(
            actor_external_id,
            "chunk.native.update",
            "chunk",
            chunk_id,
            {"tags": tags},
        )
        self.db.commit()
        return item

    async def embed_native_chunks_document(
        self,
        document_id: str,
        *,
        integration_key: str | None,
    ) -> dict[str, Any] | None:
        """对单个已切分文档提交 ChatDoc 向量化，并提交事务。

        参数:
            document_id: 目标文档 ID。
            integration_key: 可选 RAG 接入实例 key。

        返回:
            提交成功时返回 ChatDoc 向量化结果；文档不存在时返回 None。

        副作用/失败模式:
            会调用 ChatDoc 向量化接口并提交本地状态变更；云端调用失败时抛出 IflytekChatDocError。
        """

        document = self.repository.get_active_document(document_id)
        if not document:
            return None
        result = await IflytekDocumentService(
            self.db,
            integration_key=integration_key,
        ).activate_vectorization([str(document.id)])
        self.db.commit()
        return result

    def restore_native_chunk_revision(
        self,
        document_id: str,
        revision_id: str,
        actor_external_id: str | None,
    ) -> dict[str, Any] | None:
        """恢复指定原生切片历史快照，并写入审计日志。

        参数:
            document_id: 目标文档 ID。
            revision_id: 待恢复的修订 ID。
            actor_external_id: 当前操作人的外部用户 ID；系统任务可传 None。

        返回:
            恢复成功时返回恢复统计；文档不存在时返回 None。

        副作用/失败模式:
            修订 ID 非法或修订不存在时抛出 ValueError；成功恢复后会写审计并提交事务。
        """

        document = self.repository.get_active_document(document_id)
        if not document:
            return None
        revision_uuid = self.repository.parse_uuid(revision_id)
        if not revision_uuid:
            raise ValueError("版本不存在")
        result = NativeChunkRevisionService(self.db).restore_revision(document, revision_uuid)
        self.repository.record_admin_audit(
            actor_external_id,
            "document.native_chunks.restore",
            "document",
            document_id,
            result,
        )
        self.db.commit()
        return result

    def restore_recycled_document(self, document_id: str, actor_external_id: str | None) -> dict[str, Any] | None:
        """从回收站恢复知识库文档，并写入审计日志。

        参数:
            document_id: 待恢复的文档 ID。
            actor_external_id: 当前操作人的外部用户 ID；系统任务可传 None。

        返回:
            恢复成功时返回文档状态字典；文档不存在或不在回收站时返回 None。
        """

        result = self.repository.restore_recycled_document(document_id)
        if not result:
            return None
        self.repository.record_admin_audit(
            actor_external_id,
            "document.restore",
            "document",
            document_id,
            result,
        )
        self.db.commit()
        return result

    def recycle_document(self, document_id: str, actor_external_id: str | None) -> dict[str, Any] | None:
        """软回收知识库文档，并写入审计日志。

        参数:
            document_id: 待回收的文档 ID。
            actor_external_id: 当前操作人的外部用户 ID；系统任务可传 None。

        返回:
            回收成功时返回文档状态字典；文档不存在或已物理删除时返回 None。
        """

        result = self.repository.recycle_document(document_id)
        if not result:
            return None
        self.repository.record_admin_audit(
            actor_external_id,
            "document.recycle",
            "document",
            document_id,
            result,
        )
        self.db.commit()
        return result

    async def purge_recycled_document(
        self,
        document_id: str,
        *,
        sync_chatdoc: bool,
        actor_external_id: str | None,
    ) -> dict[str, Any] | None:
        """物理清理回收站文档，并写入审计日志。

        参数:
            document_id: 待清理的文档 ID。
            sync_chatdoc: 是否同步删除 ChatDoc 云端文件。
            actor_external_id: 当前操作人的外部用户 ID；系统任务可传 None。

        返回:
            清理成功时返回清理结果；文档不存在或已物理删除时返回 None。

        副作用/失败模式:
            非回收站文档会抛出 ValueError；云端删除失败会继续向上传递底层异常，供路由保持原有映射。
        """

        result = await self.repository.purge_recycled_document(document_id, sync_chatdoc=sync_chatdoc)
        if not result:
            return None
        self.repository.record_admin_audit(
            actor_external_id,
            "document.purge",
            "document",
            document_id,
            result,
        )
        self.db.commit()
        return result

    async def purge_document(
        self,
        document_id: str,
        *,
        sync_chatdoc: bool,
        actor_external_id: str | None,
    ) -> dict[str, Any] | None:
        """物理删除知识库文档，并写入审计日志。

        参数:
            document_id: 待删除的文档 ID。
            sync_chatdoc: 是否同步删除 ChatDoc 云端文件。
            actor_external_id: 当前操作人的外部用户 ID；系统任务可传 None。

        返回:
            删除成功时返回清理结果；文档不存在时返回 None。

        副作用/失败模式:
            会调用仓储的物理删除流程并提交事务；云端删除失败会继续向上传递底层异常。
        """

        result = await self.repository.purge_document(document_id, sync_chatdoc=sync_chatdoc)
        if not result:
            return None
        self.repository.record_admin_audit(
            actor_external_id,
            "document.purge",
            "document",
            document_id,
            result,
        )
        self.db.commit()
        return result

    def update_course_model_config(
        self,
        course_id: str,
        payload: dict[str, Any],
        actor_external_id: str | None,
    ) -> dict[str, Any]:
        """更新课程级模型和知识库绑定配置，并写入审计日志。

        参数:
            course_id: 课程 slug 或 ID。
            payload: 已经由 API Schema 校验并去除未设置字段的配置变更。
            actor_external_id: 当前操作人的外部用户 ID；系统任务可传 None。

        返回:
            课程模型配置更新结果，包含成功、失败或 not_found 状态。
        """

        result = self.repository.update_course_model_config(course_id, payload)
        self.repository.record_admin_audit(
            actor_external_id,
            "course.model_config.update",
            "course",
            course_id,
            payload,
        )
        self.db.commit()
        return result

    async def batch_embed_documents(
        self,
        document_ids: list[str],
        *,
        integration_key: str | None,
        actor_external_id: str | None,
    ) -> dict[str, Any]:
        """批量提交待授权文档向量化，并写入审计日志。

        参数:
            document_ids: 待提交向量化的本地文档 ID 列表。
            integration_key: 可选 RAG 接入实例 key。
            actor_external_id: 当前操作人的外部用户 ID；系统任务可传 None。

        返回:
            批量向量化响应字典，包含 accepted、rejected、target_status 和 message。
        """

        result = await IflytekDocumentService(
            self.db,
            integration_key=integration_key,
        ).activate_vectorization(document_ids)
        accepted = result.get("accepted") or []
        rejected = result.get("rejected") or []
        self.repository.record_admin_audit(
            actor_external_id,
            "document.batch_embed",
            "knowledge",
            "batch",
            {"accepted": [item["document_id"] for item in accepted], "rejected": rejected},
        )
        self.db.commit()
        message = (
            f"已向云端提交 {len(accepted)} 份文档的向量化任务。"
            if accepted
            else "没有文档进入向量化；请确认已处于「待授权入库」状态。"
        )
        return {
            "accepted": accepted,
            "rejected": rejected,
            "target_status": "vectoring",
            "message": message,
        }

    async def extract_documents(
        self,
        document_ids: list[str],
        *,
        integration_key: str | None,
        extract_stage_body: dict[str, Any] | None,
        actor_external_id: str | None,
    ) -> dict[str, Any]:
        """批量提交云端问答萃取任务，并写入审计日志。

        参数:
            document_ids: 待提交萃取的本地文档 ID 列表。
            integration_key: 可选 RAG 接入实例 key。
            extract_stage_body: 可选的萃取阶段配置。
            actor_external_id: 当前操作人的外部用户 ID；系统任务可传 None。

        返回:
            批量萃取响应字典，包含 accepted、rejected 和 message。
        """

        result = await IflytekDocumentService(
            self.db,
            integration_key=integration_key,
        ).extract_documents(
            document_ids,
            extract_stage_body=extract_stage_body,
        )
        accepted = result.get("accepted") or []
        rejected = result.get("rejected") or []
        self.repository.record_admin_audit(
            actor_external_id,
            "document.extract",
            "knowledge",
            "batch",
            {"accepted": [item["document_id"] for item in accepted], "rejected": rejected},
        )
        self.db.commit()
        message = (
            f"已向云端提交 {len(accepted)} 份文档的萃取任务。"
            if accepted
            else "没有文档进入萃取；请确认云端状态为 vectored（已向量化）。"
        )
        return {"accepted": accepted, "rejected": rejected, "message": message}
