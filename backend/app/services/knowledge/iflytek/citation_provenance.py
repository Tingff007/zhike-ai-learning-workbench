from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Course, Document, DocumentChunk
from app.schemas.common import Citation
from app.services.knowledge.iflytek.native_chunk_sync import NATIVE_PARSER_VERSION

IFLYTEK_CHUNK_PREFIX = "iflytek:"


def parse_chunk_index_from_row(row: dict) -> int | None:
    """从 ChatDoc 检索行中提取切片序号。

    参数:
        row: vector/search 或文档问答返回的单行字典，可能包含 index、dataIndex 或 fileRefer。

    返回:
        成功解析时返回切片序号整数；字段缺失或无法转换时返回 None。

    副作用/失败:
        不修改输入字典；非法字段会被忽略，不向外抛出转换异常。
    """
    index_raw = row.get("index")
    if index_raw is None:
        index_raw = row.get("dataIndex")
    if index_raw is not None:
        try:
            return int(index_raw)
        except (TypeError, ValueError):
            pass

    file_refer = row.get("fileRefer") or row.get("file_refer")
    if file_refer is None:
        return None
    if isinstance(file_refer, list) and file_refer:
        file_refer = file_refer[0]
    if isinstance(file_refer, dict):
        inner = file_refer.get("index")
        if inner is None:
            inner = file_refer.get("dataIndex")
        if inner is not None:
            try:
                return int(inner)
            except (TypeError, ValueError):
                return None
    try:
        return int(file_refer)
    except (TypeError, ValueError):
        return None


def parse_iflytek_chunk_ref(
    *,
    chunk_id: str | None = None,
    file_id: str | None = None,
    chunk_index: int | None = None,
) -> tuple[str, int] | None:
    """解析讯飞 fileId 与切片序号引用。

    参数:
        chunk_id: 可选切片 ID，支持 iflytek:<fileId>:<index> 格式。
        file_id: 可选讯飞 ChatDoc fileId。
        chunk_index: 可选切片序号。

    返回:
        能解析时返回 (fileId, chunk_index)；引用不完整或格式非法时返回 None。

    副作用/失败:
        仅做字符串和整数转换；非法序号会返回 None，不抛出 ValueError。
    """
    if chunk_id and chunk_id.startswith(IFLYTEK_CHUNK_PREFIX):
        parts = chunk_id.split(":")
        if len(parts) >= 3:
            try:
                return parts[1], int(parts[-1])
            except ValueError:
                return None
    cleaned_file = (file_id or "").strip()
    if cleaned_file and cleaned_file != "chatdoc" and chunk_index is not None:
        return cleaned_file, int(chunk_index)
    return None


def _file_to_document_map(db: Session, course_id) -> dict[str, Document]:
    documents = db.scalars(
        select(Document).where(
            Document.course_id == course_id,
            Document.deleted_at.is_(None),
        )
    ).all()
    mapping: dict[str, Document] = {}
    for document in documents:
        file_id = str((document.meta_json or {}).get("iflytek_file_id") or "").strip()
        if file_id:
            mapping[file_id] = document
    return mapping


def _load_native_chunks(
    db: Session,
    *,
    document_ids: list,
    indexes: set[int],
) -> dict[tuple, DocumentChunk]:
    if not document_ids or not indexes:
        return {}
    rows = db.scalars(
        select(DocumentChunk).where(
            DocumentChunk.document_id.in_(document_ids),
            DocumentChunk.parser_version == NATIVE_PARSER_VERSION,
            DocumentChunk.lifecycle_status == "active",
            DocumentChunk.chunk_index.in_(sorted(indexes)),
        )
    ).all()
    return {(chunk.document_id, chunk.chunk_index): chunk for chunk in rows}


def enrich_citations_with_local_provenance(
    db: Session,
    course_slug: str,
    citations: list[Citation],
) -> list[Citation]:
    """用本地原生切片信息补全引用溯源字段。

    参数:
        db: SQLAlchemy 会话，用于读取课程、文档和本地切片。
        course_slug: 引用所属课程 slug。
        citations: 待补全的 Citation 列表。

    返回:
        补全后的 Citation 列表；无法匹配课程、文档或切片时保留原引用或仅补充云端来源字段。

    副作用/失败:
        只读取数据库，不写入状态；数据库查询失败时抛出 SQLAlchemy 异常。
    """
    if not citations:
        return citations

    course = db.execute(select(Course).where(Course.slug == course_slug)).scalar_one_or_none()
    if not course:
        return citations

    file_docs = _file_to_document_map(db, course.id)
    refs: list[tuple[str, int]] = []
    for citation in citations:
        parsed = parse_iflytek_chunk_ref(
            chunk_id=citation.chunk_id,
            file_id=citation.source_id,
            chunk_index=citation.chunk_index,
        )
        if parsed:
            refs.append(parsed)

    if not refs:
        return citations

    doc_ids = [file_docs[fid].id for fid, _ in refs if fid in file_docs]
    indexes = {idx for _, idx in refs}
    chunk_by_key = _load_native_chunks(db, document_ids=doc_ids, indexes=indexes)

    enriched: list[Citation] = []
    for citation in citations:
        parsed = parse_iflytek_chunk_ref(
            chunk_id=citation.chunk_id,
            file_id=citation.source_id,
            chunk_index=citation.chunk_index,
        )
        if not parsed:
            enriched.append(citation)
            continue
        file_id, index_val = parsed
        document = file_docs.get(file_id)
        if not document:
            enriched.append(
                citation.model_copy(
                    update={
                        "iflytek_file_id": file_id,
                        "chunk_index": index_val,
                        "provenance_source": "cloud_retrieval",
                    }
                )
            )
            continue

        chunk = chunk_by_key.get((document.id, index_val))
        if not chunk:
            enriched.append(
                citation.model_copy(
                    update={
                        "iflytek_file_id": file_id,
                        "chunk_index": index_val,
                        "provenance_source": "cloud_retrieval",
                        "section_path": citation.section_path or f"分片 #{index_val}",
                    }
                )
            )
            continue

        body = (chunk.content or chunk.raw_text or citation.content or citation.snippet or "").strip()
        snippet = body[:320] if body else citation.snippet
        enriched.append(
            citation.model_copy(
                update={
                    "page_no": chunk.page_no if chunk.page_no is not None else citation.page_no,
                    "content": body or citation.content,
                    "snippet": snippet,
                    "chunk_id": citation.chunk_id or f"{IFLYTEK_CHUNK_PREFIX}{file_id}:{index_val}",
                    "iflytek_file_id": file_id,
                    "chunk_index": index_val,
                    "local_chunk_id": str(chunk.id),
                    "provenance_source": "local_native",
                    "section_path": f"分片 #{index_val}",
                    "source_title": citation.source_title or document.title or document.filename,
                }
            )
        )

    return enriched
