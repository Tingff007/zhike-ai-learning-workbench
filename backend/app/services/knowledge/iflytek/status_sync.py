from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.core.database import SessionLocal
from app.models import Document
from app.services.knowledge.iflytek.client import IflytekChatDocError
from app.services.knowledge.iflytek.client_factory import chatdoc_client_for_db
from app.services.knowledge.iflytek.cloud_status import (
    PENDING_ACTIVATION_VECTOR_STATUS,
    map_chatdoc_status,
)
from app.services.knowledge.iflytek.document_service import IflytekDocumentService
from app.services.knowledge.iflytek.native_chunk_sync import (
    mark_native_chunks_vectorized,
    maybe_auto_sync_native_chunks,
)
from app.services.knowledge.iflytek.status_labels import normalize_chatdoc_file_status

logger = logging.getLogger(__name__)


def _parse_iso_timestamp(value: str | None) -> datetime | None:
    """兼容解析 ChatDoc 或本地元数据中的 ISO 时间戳。

    参数:
        value: 可能为空、带 `Z` 后缀或缺少时区的时间字符串。

    返回:
        可解析时返回带时区的 datetime；空值或非法时间返回 None。

    副作用/失败:
        不修改外部状态；无时区时间按 UTC 处理，解析失败不抛出异常。
    """
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def apply_chatdoc_file_status(document: Document, file_status: str, *, payload: dict | None = None) -> None:
    """把 ChatDoc fileStatus 同步到文档 ORM 字段和 meta_json。

    参数:
        document: 需要更新状态的 Document ORM 对象。
        file_status: ChatDoc 返回的 fileStatus 原始值或已归一化值。
        payload: 可选原始状态响应，用于保存云端状态、来源和错误信息。

    返回:
        None。

    副作用/失败:
        会修改传入 document 的 parse_status、vector_status、review_status、publish_readiness 和 meta_json；
        不提交事务，由调用方负责 flush 或 commit。
    """
    normalized = normalize_chatdoc_file_status(file_status)
    meta_before = document.meta_json or {}
    raw_step = meta_before.get("chatdoc_step_by_step")
    step_mode = bool(raw_step) if raw_step is not None else None
    parse_status, vector_status, publish_readiness = map_chatdoc_status(normalized, step_by_step=step_mode)
    document.parse_status = parse_status
    document.vector_status = vector_status
    document.text_vector_status = vector_status
    if vector_status == "ready":
        document.publish_readiness = "ready"
        document.review_status = "approved"
    elif vector_status == PENDING_ACTIVATION_VECTOR_STATUS:
        document.publish_readiness = publish_readiness
        document.review_status = "pending"
    elif vector_status == "failed":
        document.publish_readiness = "blocked"
    now_iso = datetime.now(timezone.utc).isoformat()
    status_source = "poll"
    if payload:
        raw_source = str(payload.get("source") or "").strip().lower()
        if raw_source in {"webhook", "poll", "upload", "manual"}:
            status_source = raw_source
    meta = {
        **(document.meta_json or {}),
        "chatdoc_status": payload or {"fileStatus": normalized},
        "chatdoc_file_status": normalized or None,
        "cloud_status": normalized or None,
        "last_synced_at": now_iso,
        "last_status_source": status_source,
    }
    if vector_status == "failed":
        raw = payload or {}
        meta["chatdoc_error"] = raw.get("desc") or raw.get("message") or meta.get("chatdoc_error")
    uploaded_at = _parse_iso_timestamp(str(meta.get("chatdoc_uploaded_at") or ""))
    if vector_status == "ready" and uploaded_at:
        meta["ingestion_duration_ms"] = int((datetime.now(timezone.utc) - uploaded_at).total_seconds() * 1000)
    document.meta_json = meta


async def _maybe_backfill_chunk_total(service: IflytekDocumentService, document: Document, file_id: str) -> None:
    """回填 ChatDoc 切片数量并尽量同步原生切片。

    参数:
        service: 已绑定数据库会话和 ChatDoc 客户端的文档服务。
        document: 需要回填元数据的本地文档实体。
        file_id: ChatDoc 文件 ID。

    返回:
        None；同步结果会写入 document.meta_json。

    副作用/失败:
        可能调用 ChatDoc file/chunks 或原生切片同步流程，并写入 document.meta_json。ChatDoc 可恢复错误会记录
        warning 后降级返回，不阻断状态同步主流程；数据库写入异常继续向上传递。
    """
    meta = document.meta_json or {}
    if meta.get("chatdoc_chunk_total") and meta.get("native_chunks_synced_at"):
        return
    file_status = str(meta.get("chatdoc_file_status") or "")
    synced = await maybe_auto_sync_native_chunks(
        service.db,
        document,
        file_id,
        file_status=file_status,
        service=service,
    )
    if synced and not synced.get("error"):
        return
    if meta.get("chatdoc_chunk_total"):
        return
    try:
        items = await service.fetch_file_chunks(file_id)
    except IflytekChatDocError as exc:
        logger.warning("ChatDoc 切片计数回填失败，将保留当前文档状态：document_id=%s error=%s", document.id, exc, exc_info=True)
        return
    document.meta_json = {**meta, "chatdoc_chunk_total": len(items)}


async def sync_document_status(document_id: str, *, max_attempts: int = 60, interval_seconds: float = 5.0) -> None:
    """轮询并同步单个文档的 ChatDoc 云端状态。

    参数:
        document_id: 本地 Document 主键字符串。
        max_attempts: 最大轮询次数。
        interval_seconds: 每次失败或未完成后的等待秒数。

    返回:
        None。

    副作用/失败:
        每轮会创建数据库会话、请求 ChatDoc file/status，并在本地提交状态更新；
        ChatDoc 可恢复错误会记录日志后继续重试，数据库异常或未捕获异常会向上抛出并关闭会话。
    """
    for _attempt in range(max_attempts):
        db = SessionLocal()
        try:
            client = chatdoc_client_for_db(db)
            if not client.configured:
                logger.warning("ChatDoc 凭据缺失，跳过文档状态同步：document_id=%s", document_id)
                return
            document = db.get(Document, document_id)
            if not document:
                return
            file_id = (document.meta_json or {}).get("iflytek_file_id")
            if not file_id:
                return
            service = IflytekDocumentService(db, client)
            try:
                payload = await service.fetch_file_status(file_id)
            except IflytekChatDocError as exc:
                logger.warning("ChatDoc 状态同步失败，将等待后重试：document_id=%s error=%s", document_id, exc, exc_info=True)
                document.meta_json = {
                    **(document.meta_json or {}),
                    "last_synced_at": datetime.now(timezone.utc).isoformat(),
                }
                db.commit()
                await asyncio.sleep(interval_seconds)
                continue

            file_status = normalize_chatdoc_file_status(
                str(payload.get("fileStatus") or payload.get("file_status") or "")
            )
            apply_chatdoc_file_status(
                document,
                file_status or "",
                payload={**payload, "source": "poll"},
            )
            db.flush()

            if document.vector_status == PENDING_ACTIVATION_VECTOR_STATUS:
                await _maybe_backfill_chunk_total(service, document, file_id)
                db.commit()
                return

            if document.vector_status == "ready":
                await _maybe_backfill_chunk_total(service, document, file_id)
                mark_native_chunks_vectorized(db, document)
            db.commit()

            if document.vector_status in {"ready", "failed"}:
                return
        finally:
            db.close()
        await asyncio.sleep(interval_seconds)


def schedule_chatdoc_status_sync(document_id: str) -> None:
    """调度 ChatDoc 文档状态同步任务。

    参数:
        document_id: 本地 Document 主键字符串。

    返回:
        None。

    副作用/失败:
        在已有事件循环中创建后台任务；没有运行中的事件循环时会同步运行到完成。
        sync_document_status 抛出的未捕获异常会按 asyncio 任务或同步执行路径传播。
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(sync_document_status(document_id))
    except RuntimeError:
        asyncio.run(sync_document_status(document_id))
