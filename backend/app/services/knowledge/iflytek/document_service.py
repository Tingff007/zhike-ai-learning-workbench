from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Document
from app.core.config import settings
from app.services.knowledge.iflytek.client import IflytekChatDocClient, IflytekChatDocError
from app.services.knowledge.iflytek.client_factory import chatdoc_client_for_db
from app.services.knowledge.iflytek.cloud_status import can_trigger_embedding, can_trigger_extract, chatdoc_step_by_step_enabled
from app.services.knowledge.iflytek.repo_service import IflytekRepoService
from app.services.knowledge.iflytek.response_utils import extract_chatdoc_scalar
from app.services.knowledge.iflytek.upload_utils import chatdoc_parse_type, guess_upload_mime_type
from app.services.knowledge.iflytek.config_service import ChatdocConfigService
from app.services.knowledge.iflytek.pipeline_config import (
    config_with_stage_override,
    extract_request_from_pipeline,
    step_by_step_from_pipeline,
    upload_form_fields_from_pipeline,
)
from app.services.knowledge.iflytek.vendor_quota import (
    ChatdocVendorQuotaNotReadyError,
    ChatdocVendorQuotaService,
    parse_upload_quantity,
)
from app.services.knowledge.iflytek.wiki_split_extends import sanitize_wiki_split_extends
from app.services.knowledge.repository import KnowledgeRepository

CHUNK_PREVIEW_CHARS = 320
logger = logging.getLogger(__name__)


class IflytekDocumentService:
    """封装讯飞 ChatDoc 文档上传、状态查询、分块读取和云端操作。

    参数：
        db: SQLAlchemy 数据库会话，用于读取文档、仓库和接入配置并写入处理状态。
        client: 可选的 ChatDoc 客户端；为空时根据数据库配置创建。
        integration_key: 可选接入实例 key，用于选择凭证、流水线配置和供应商余量记录。

    副作用：
        部分方法会调用讯飞 ChatDoc 接口、更新文档状态、写入元数据或记录供应商用量。

    失败模式：
        凭证缺失、供应商接口失败、文档状态不满足条件或数据库写入失败时，方法会抛出异常或返回 rejected 项。
    """

    def __init__(
        self,
        db: Session,
        client: IflytekChatDocClient | None = None,
        *,
        integration_key: str | None = None,
    ) -> None:
        self.db = db
        self.integration_key = integration_key
        self.client = client or chatdoc_client_for_db(db, integration_key=integration_key)
        self.repo_service = IflytekRepoService(db, self.client)

    @staticmethod
    def callback_url() -> str | None:
        """生成 ChatDoc 回调地址。

        参数：
            无。

        返回：
            PUBLIC_API_BASE_URL 与 CHATDOC_WEBHOOK_PATH 拼接后的完整回调地址；配置不完整时返回 None。

        副作用与失败模式：
            仅读取运行时配置，不修改状态；配置值为空时不会抛出异常。
        """
        base = (settings.PUBLIC_API_BASE_URL or "").strip().rstrip("/")
        path = (settings.CHATDOC_WEBHOOK_PATH or "").strip()
        if not base or not path:
            return None
        if not path.startswith("/"):
            path = f"/{path}"
        return f"{base}{path}"

    async def upload_to_chatdoc(
        self,
        *,
        course_slug: str,
        filename: str,
        content: bytes,
        document: Document,
        mime_type: str | None = None,
        upload_stage_body: dict | None = None,
    ) -> dict:
        """上传文档到 ChatDoc 并写回本地文档处理状态。

        参数：
            course_slug: 课程 slug，用于确保或创建对应的 ChatDoc 知识库。
            filename: 上传到供应商侧的文件名。
            content: 文件二进制内容。
            document: 本地文档模型，会被写入 ChatDoc fileId、仓库 id 和处理状态。
            mime_type: 可选 MIME 类型；为空时根据文件名推断。
            upload_stage_body: 上传预处理阶段的临时流水线覆盖配置。

        返回：
            包含 file_id、repo_id、sid、上传页数、分步处理标记和回调地址的字典。

        副作用与失败模式：
            会调用供应商上传和绑定接口、更新本地文档元数据并 flush 数据库；供应商未返回 fileId 时抛出 IflytekChatDocError。
        """
        repo_id = await self.repo_service.ensure_repo(course_slug)
        config_service = ChatdocConfigService(self.db)
        pipeline = config_with_stage_override(
            config_service.pipeline_config(self.integration_key),
            stage_id="upload_preprocess",
            body=upload_stage_body,
        )
        extra_fields: dict[str, str] = dict(upload_form_fields_from_pipeline(pipeline))
        if extend_raw := extra_fields.get("extend"):
            try:
                extend_obj = json.loads(extend_raw)
                if isinstance(extend_obj, dict):
                    wiki = extend_obj.get("wikiSplitExtends")
                    if isinstance(wiki, dict):
                        extend_obj["wikiSplitExtends"] = sanitize_wiki_split_extends(wiki)
                        extra_fields["extend"] = json.dumps(extend_obj, ensure_ascii=False)
            except json.JSONDecodeError:
                pass
        if "stepByStep" in extra_fields:
            step_by_step = extra_fields.pop("stepByStep").lower() == "true"
        else:
            step_by_step = step_by_step_from_pipeline(pipeline, chatdoc_step_by_step_enabled())
        callback = self.callback_url()
        if callback and "callbackUrl" not in extra_fields:
            extra_fields["callbackUrl"] = callback
        parse_type = extra_fields.pop("parseType", None) or chatdoc_parse_type(filename)
        file_type = extra_fields.pop("fileType", None) or "wiki"
        upload_payload = await self.client.upload_file(
            filename=filename,
            content=content,
            mime_type=guess_upload_mime_type(filename, mime_type),
            file_type=file_type,
            parse_type=parse_type,
            step_by_step=step_by_step,
            extra_fields=extra_fields or None,
        )
        file_id = extract_chatdoc_scalar(upload_payload, "fileId", "file_id", "id")
        if not file_id:
            raise IflytekChatDocError(f"ChatDoc file/upload 未返回 fileId：{upload_payload}")

        sid = upload_payload.get("sid") or upload_payload.get("chatdoc_sid")
        parse_type = str(upload_payload.get("parseType") or chatdoc_parse_type(filename))
        document.meta_json = {
            **(document.meta_json or {}),
            "iflytek_file_id": file_id,
            "iflytek_repo_id": repo_id,
            "chatdoc_sid": sid,
            "parse_type": parse_type,
            "rag_backend": "iflytek_chatdoc",
            "chatdoc_uploaded_at": datetime.now(timezone.utc).isoformat(),
            "cloud_status": "uploaded",
            "chatdoc_step_by_step": step_by_step,
            "chatdoc_callback_url": callback,
        }
        document.parse_status = "processing"
        document.vector_status = "pending" if step_by_step else "processing"
        document.text_vector_status = document.vector_status
        document.publish_readiness = "blocked"
        document.parser_version = "iflytek_chatdoc"
        self.db.flush()

        try:
            await self.client.post_json("/openapi/v1/repo/file/add", {"repoId": repo_id, "fileIds": [file_id]})
        except IflytekChatDocError:
            # 部分租户会自动绑定上传文件，绑定失败不应阻断入库流程。
            logger.debug("ChatDoc 文件绑定知识库失败，继续等待租户侧自动绑定：repo_id=%s file_id=%s", repo_id, file_id, exc_info=True)

        upload_pages = parse_upload_quantity(upload_payload)
        if upload_pages > 0:
            try:
                quota_key = self.integration_key or ChatdocConfigService(self.db).active_template_key()
                ChatdocVendorQuotaService(self.db).record_upload_pages(
                    upload_pages,
                    integration_key=quota_key,
                )
            except ChatdocVendorQuotaNotReadyError:
                # 余量表未迁移时不阻断上传主流程。
                logger.debug("ChatDoc 供应商余量表未就绪，跳过上传页数记录：file_id=%s", file_id, exc_info=True)
            except Exception:
                logger.warning(
                    "记录 ChatDoc 上传页数失败，管理端供应商余量可能失真：file_id=%s integration_key=%s upload_pages=%s",
                    file_id,
                    quota_key,
                    upload_pages,
                    exc_info=True,
                )

        return {
            "file_id": file_id,
            "repo_id": repo_id,
            "sid": sid,
            "upload_quantity_pages": upload_pages,
            "step_by_step": step_by_step,
            "callback_url": callback,
        }

    @staticmethod
    def _comma_file_ids(file_ids: str | list[str]) -> str:
        if isinstance(file_ids, str):
            return file_ids.strip()
        return ",".join(item.strip() for item in file_ids if item and item.strip())

    async def fetch_file_status(self, file_id: str) -> dict:
        """查询 ChatDoc 云端文件状态。

        参数：
            file_id: 供应商侧文件 id。

        返回：
            匹配 file_id 的状态行；供应商返回列表但未精确匹配时返回首行，其他情况返回原始响应。

        副作用与失败模式：
            会调用供应商状态接口；接口失败时由客户端抛出 IflytekChatDocError。
        """
        payload = await self.client.post_form(
            "/openapi/v1/file/status",
            {"fileIds": self._comma_file_ids(file_id)},
        )
        rows = payload.get("items")
        if isinstance(rows, list):
            for row in rows:
                if isinstance(row, dict) and str(row.get("fileId") or "") == file_id:
                    return row
            if rows and isinstance(rows[0], dict):
                return rows[0]
        return payload

    async def trigger_embedding(self, file_id: str) -> dict:
        """触发单个 ChatDoc 文件向量化。

        参数：
            file_id: 供应商侧文件 id。

        返回：
            供应商向量化接口响应字典。

        副作用与失败模式：
            会调用供应商向量化接口；file_id 为空或接口失败时由批量方法抛出 IflytekChatDocError。
        """
        return await self.trigger_embedding_batch([file_id])

    async def trigger_embedding_batch(self, file_ids: list[str]) -> dict:
        """批量触发 ChatDoc 文件向量化。

        参数：
            file_ids: 供应商侧文件 id 列表，空白项会被过滤。

        返回：
            供应商向量化接口响应字典。

        副作用与失败模式：
            会调用供应商向量化接口；清洗后无 fileId 时抛出 IflytekChatDocError。
        """
        cleaned = [item.strip() for item in file_ids if item and item.strip()]
        if not cleaned:
            raise IflytekChatDocError("向量化激活缺少 fileId")
        return await self.client.post_form(
            "/openapi/v1/file/embedding",
            {"fileIds": self._comma_file_ids(cleaned)},
        )

    async def fetch_file_chunks(self, file_id: str) -> list[dict]:
        """获取 ChatDoc 文件的分块预览。

        参数：
            file_id: 供应商侧文件 id。

        返回：
            规范化后的分块列表，每项包含序号、数据类型、全文内容和预览内容。

        副作用与失败模式：
            会调用 GET /openapi/v1/file/chunks；接口失败时由客户端抛出 IflytekChatDocError。
        """
        cleaned = file_id.strip()
        payload = await self.client.get_json("/openapi/v1/file/chunks", {"fileId": cleaned})
        return self.normalize_chunks_payload(payload)

    async def fetch_file_content(self, file_id: str) -> list[dict]:
        """全量拉取 wiki 分块内容，兼容旧调用名。

        参数：
            file_id: 供应商侧文件 id。

        返回：
            与 fetch_file_chunks 相同的规范化分块列表。

        副作用与失败模式：
            会调用供应商分块接口；接口失败时由客户端抛出 IflytekChatDocError。
        """
        return await self.fetch_file_chunks(file_id)

    async def resplit_file(self, file_id: str, split_body: dict | None = None) -> dict:
        """按指定切分配置重切 ChatDoc 文件。

        参数：
            file_id: 供应商侧文件 id。
            split_body: 可选切分请求体，支持 fileIds、splitType、isSplitDefault 和 wikiSplitExtends。

        返回：
            供应商重切接口响应字典。

        副作用与失败模式：
            会调用 POST /openapi/v1/file/split；file_id 为空或接口失败时抛出 IflytekChatDocError。
        """
        cleaned = file_id.strip()
        if not cleaned:
            raise IflytekChatDocError("重切缺少 fileId")
        body = split_body or {}
        file_ids_raw = body.get("fileIds")
        if isinstance(file_ids_raw, list):
            file_ids = [str(item).strip() for item in file_ids_raw if str(item).strip()]
        else:
            file_ids = [item.strip() for item in self._comma_file_ids(str(file_ids_raw or cleaned)).split(",") if item.strip()]
        if not file_ids:
            file_ids = [cleaned]
        payload: dict = {
            "splitType": str(body.get("splitType") or "wiki"),
            "fileIds": file_ids,
        }
        use_vendor_default = bool(body.get("isSplitDefault", True))
        payload["isSplitDefault"] = use_vendor_default
        if not use_vendor_default:
            wiki_ext = body.get("wikiSplitExtends")
            if isinstance(wiki_ext, dict):
                sanitized = sanitize_wiki_split_extends(wiki_ext)
                if sanitized:
                    payload["wikiSplitExtends"] = sanitized
        return await self.client.post_json("/openapi/v1/file/split", payload)

    @staticmethod
    def _wiki_chunk_rows(payload: dict | list | None) -> list[dict]:
        if isinstance(payload, list):
            return [row for row in payload if isinstance(row, dict)]
        if isinstance(payload, dict):
            for key in ("items", "chunks", "data", "list"):
                raw = payload.get(key)
                if isinstance(raw, list):
                    return [row for row in raw if isinstance(row, dict)]
                if isinstance(raw, dict):
                    return [raw]
        return []

    @staticmethod
    def normalize_wiki_chunk_rows(payload: dict | list | None) -> list[dict]:
        """规范化 wiki 分块原始响应行。

        参数：
            payload: 供应商分块接口返回的字典、列表或 None。

        返回：
            按 index 排序的分块列表，包含内容、字符数、供应商分块 id 和数据类型等字段。

        副作用与失败模式：
            不修改输入对象，不访问外部资源；异常索引值会回退为当前列表位置。
        """
        items: list[dict] = []
        for row in IflytekDocumentService._wiki_chunk_rows(payload):
            content = str(row.get("content") or "").strip()
            index_raw = row.get("dataIndex")
            if index_raw is None:
                index_raw = row.get("index")
            try:
                index_val = int(index_raw) if index_raw is not None else len(items)
            except (TypeError, ValueError):
                index_val = len(items)
            vendor_chunk_id = row.get("id")
            items.append(
                {
                    "index": index_val,
                    "page": None,
                    "content": content,
                    "char_count": len(content),
                    "char_start": None,
                    "char_end": None,
                    "vendor_chunk_id": str(vendor_chunk_id) if vendor_chunk_id is not None else None,
                    "data_type": str(row.get("dataType") or row.get("data_type") or "wiki"),
                    "tags": [],
                }
            )
        items.sort(key=lambda item: item["index"])
        return items

    @staticmethod
    def normalize_chunks_payload(payload: dict | list | None) -> list[dict]:
        """将供应商分块响应转换为前端预览结构。

        参数：
            payload: 供应商分块接口返回的字典、列表或 None。

        返回：
            只包含 index、data_type、content 和 preview 的分块列表。

        副作用与失败模式：
            不访问外部资源；异常或缺失字段会由 normalize_wiki_chunk_rows 兜底处理。
        """
        items = IflytekDocumentService.normalize_wiki_chunk_rows(payload)
        return [
            {
                "index": item["index"],
                "data_type": item["data_type"],
                "content": item["content"],
                "preview": (item["content"] or "")[:CHUNK_PREVIEW_CHARS],
            }
            for item in items
        ]

    @staticmethod
    def normalize_content_payload(payload: dict | list | None) -> list[dict]:
        """将供应商分块响应转换为完整内容结构。

        参数：
            payload: 供应商分块接口返回的字典、列表或 None。

        返回：
            规范化后的完整分块列表。

        副作用与失败模式：
            不访问外部资源；异常或缺失字段会由 normalize_wiki_chunk_rows 兜底处理。
        """
        return IflytekDocumentService.normalize_wiki_chunk_rows(payload)

    async def delete_remote_file(self, file_id: str) -> dict:
        """删除 ChatDoc 云端文件。

        参数：
            file_id: 供应商侧文件 id。

        返回：
            供应商删除接口响应；文件已不存在时返回 not_found 状态。

        副作用与失败模式：
            会调用供应商删除接口；file_id 为空或凭证未配置时抛出 IflytekChatDocError，非 404 类错误继续向外抛出。
        """
        cleaned = (file_id or "").strip()
        if not cleaned:
            raise IflytekChatDocError("删除云端文件缺少 fileId")
        if not self.client.configured:
            raise IflytekChatDocError("ChatDoc 凭证未配置，无法删除云端文件")
        try:
            return await self.client.post_form("/openapi/v1/file/del", {"fileIds": self._comma_file_ids(cleaned)})
        except IflytekChatDocError as exc:
            if "404" in str(exc) or "不存在" in str(exc):
                return {"status": "not_found", "file_id": cleaned}
            raise

    async def activate_vectorization(self, document_ids: list[str]) -> dict:
        """为一批本地文档触发 ChatDoc 向量化。

        参数：
            document_ids: 本地文档 id 字符串列表。

        返回：
            包含 accepted 和 rejected 两组结果的字典，accepted 记录已触发的文档，rejected 记录拒绝原因。

        副作用与失败模式：
            会查询本地文档、调用供应商向量化接口、更新文档状态并安排状态同步；供应商接口失败时会向外抛出异常。
        """
        repo = KnowledgeRepository(self.db)
        accepted: list[dict] = []
        rejected: list[dict] = []
        file_ids: list[str] = []
        pending_docs: list[Document] = []

        for document_id in document_ids:
            document_uuid = repo.parse_uuid(document_id)
            if not document_uuid:
                rejected.append({"document_id": document_id, "reason": "invalid_document_id"})
                continue
            document = self.db.get(Document, document_uuid)
            if not document or document.deleted_at is not None:
                rejected.append({"document_id": document_id, "reason": "document_not_found"})
                continue
            meta = document.meta_json or {}
            file_id = str(meta.get("iflytek_file_id") or "").strip()
            file_status = str(meta.get("chatdoc_file_status") or meta.get("cloud_status") or "")
            if not file_id:
                rejected.append({"document_id": document_id, "reason": "missing_iflytek_file_id"})
                continue
            if not can_trigger_embedding(document.vector_status, file_status):
                rejected.append(
                    {
                        "document_id": document_id,
                        "iflytek_file_id": file_id,
                        "reason": f"not_awaiting_activation (vector={document.vector_status}, cloud={file_status})",
                    }
                )
                continue
            file_ids.append(file_id)
            pending_docs.append(document)

        if file_ids:
            from app.services.knowledge.iflytek.status_sync import schedule_chatdoc_status_sync

            await self.trigger_embedding_batch(file_ids)
            for document in pending_docs:
                file_id = str((document.meta_json or {}).get("iflytek_file_id") or "")
                document.vector_status = "processing"
                document.text_vector_status = "processing"
                document.publish_readiness = "blocked"
                meta = {
                    **(document.meta_json or {}),
                    "embedding_activated_at": datetime.now(timezone.utc).isoformat(),
                }
                document.meta_json = meta
                self.db.flush()
                schedule_chatdoc_status_sync(str(document.id))
                accepted.append({"document_id": str(document.id), "iflytek_file_id": file_id})

        self.db.flush()
        return {"accepted": accepted, "rejected": rejected}

    async def extract_documents(
        self,
        document_ids: list[str],
        *,
        extract_stage_body: dict | None = None,
    ) -> dict:
        """为一批已向量化文档触发 ChatDoc 文件萃取。

        参数：
            document_ids: 本地文档 id 字符串列表。
            extract_stage_body: 萃取阶段的临时流水线覆盖配置。

        返回：
            包含 accepted 和 rejected 两组结果的字典，accepted 记录已触发萃取的文档，rejected 记录拒绝原因。

        副作用与失败模式：
            会调用供应商萃取接口、记录萃取额度并 flush 数据库；单个文档接口失败会进入 rejected，数据库失败可能向外抛出异常。
        """
        repo = KnowledgeRepository(self.db)
        accepted: list[dict] = []
        rejected: list[dict] = []
        config_service = ChatdocConfigService(self.db)
        pipeline = config_with_stage_override(
            config_service.pipeline_config(self.integration_key),
            stage_id="extract_embed",
            body=extract_stage_body,
        )

        for document_id in document_ids:
            document_uuid = repo.parse_uuid(document_id)
            if not document_uuid:
                rejected.append({"document_id": document_id, "reason": "invalid_document_id"})
                continue
            document = self.db.get(Document, document_uuid)
            if not document or document.deleted_at is not None:
                rejected.append({"document_id": document_id, "reason": "document_not_found"})
                continue
            meta = document.meta_json or {}
            file_id = str(meta.get("iflytek_file_id") or "").strip()
            file_status = str(meta.get("chatdoc_file_status") or meta.get("cloud_status") or "")
            if not file_id:
                rejected.append({"document_id": document_id, "reason": "missing_iflytek_file_id"})
                continue
            if not can_trigger_extract(file_status):
                rejected.append(
                    {
                        "document_id": document_id,
                        "iflytek_file_id": file_id,
                        "reason": f"not_vectored (cloud={file_status})",
                    }
                )
                continue

            payload = extract_request_from_pipeline(pipeline, file_id=file_id)
            if not payload:
                payload = {"fileId": file_id}

            try:
                await self.client.post_json("/openapi/v1/qa/extract", payload)
            except IflytekChatDocError as exc:
                rejected.append(
                    {
                        "document_id": document_id,
                        "iflytek_file_id": file_id,
                        "reason": str(exc),
                    }
                )
                continue

            try:
                quota_key = self.integration_key or config_service.active_template_key()
                ChatdocVendorQuotaService(self.db).record_extract(integration_key=quota_key)
            except ChatdocVendorQuotaNotReadyError:
                # 余量表未迁移时不阻断抽取主流程。
                logger.debug(
                    "ChatDoc 供应商余量表未就绪，跳过抽取额度记录：document_id=%s file_id=%s",
                    document_id,
                    file_id,
                    exc_info=True,
                )
            except Exception:
                logger.warning(
                    "记录 ChatDoc 抽取额度失败，管理端供应商余量可能失真：document_id=%s file_id=%s integration_key=%s",
                    document_id,
                    file_id,
                    quota_key,
                    exc_info=True,
                )

            accepted.append({"document_id": str(document.id), "iflytek_file_id": file_id})

        self.db.flush()
        return {"accepted": accepted, "rejected": rejected}

    async def list_chunks_for_document(
        self,
        document: Document,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        """按本地文档分页列出 ChatDoc 分块。

        参数：
            document: 已绑定 ChatDoc fileId 的本地文档模型。
            limit: 返回分块数量上限。
            offset: 分块列表起始偏移量。

        返回：
            包含文档 id、fileId、向量状态、总数、分页参数和分块列表的字典。

        副作用与失败模式：
            会调用供应商分块接口；文档缺少 fileId 或凭证未配置时抛出 IflytekChatDocError。
        """
        file_id = str((document.meta_json or {}).get("iflytek_file_id") or "")
        if not file_id:
            raise IflytekChatDocError("文档未绑定 ChatDoc fileId")
        if not self.client.configured:
            from app.services.knowledge.integration_templates import get_template, template_key_for_rag_backend
            from app.services.knowledge.rag_env_credentials import missing_credentials_message

            template = get_template(template_key_for_rag_backend("iflytek_chatdoc"))
            raise IflytekChatDocError(missing_credentials_message(template))
        all_items = await self.fetch_file_chunks(file_id)
        total = len(all_items)
        return {
            "document_id": str(document.id),
            "file_id": file_id,
            "source": "iflytek_chatdoc",
            "vector_status": document.vector_status,
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": all_items[offset : offset + limit],
        }
