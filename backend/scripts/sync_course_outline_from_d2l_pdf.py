"""将 deep_learning_001 课程大纲对齐到 D2L PDF 目录切片。

用法（在 backend/ 目录执行）:
    python scripts/sync_course_outline_from_d2l_pdf.py
    python scripts/sync_course_outline_from_d2l_pdf.py --dry-run
    python scripts/sync_course_outline_from_d2l_pdf.py --document-filename 深度学习-01.pdf
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

from sqlalchemy import select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import SessionLocal
from app.models import Course, Document, DocumentChunk
from app.schemas.course import CourseOutlineApplyRequest
from app.services.course.outline_importer import D2lPlainTocImporter
from app.services.course.repository import CourseRepository
from app.services.learning.repository import LearningRepository

COURSE_SLUG = "deep_learning_001"
DEFAULT_USER = "user_zhang"
MAX_TOC_CHUNK_INDEX = 24
MAX_TOC_CHUNK_CHARS = 2000
OUTLINE_ENTRY_PATTERN = re.compile(r"\d+\.\d+(?:\.\d+)?\s+[\u4e00-\u9fffA-Za-z]")
STRONG_BODY_MARKERS = ("我们可以", "如下图", "表示为", "torch.nn", "torch.optim")


def _is_outline_chunk(content: str) -> bool:
    text = content.strip()
    if not text or len(text) > MAX_TOC_CHUNK_CHARS:
        return False
    outline_entries = len(OUTLINE_ENTRY_PATTERN.findall(text))
    has_chapter = bool(re.search(r"第\d+章", text))
    if text.upper().startswith("DIVE") and (has_chapter or outline_entries >= 1):
        return True
    if has_chapter and outline_entries >= 1:
        return True
    if outline_entries >= 3:
        body_hits = sum(1 for marker in STRONG_BODY_MARKERS if marker in text)
        if body_hits >= 2 and len(text) > 700:
            return False
        return True
    return False


def _collect_toc_text(db, *, document_filename: str | None) -> tuple[str, str]:
    course = db.execute(select(Course).where(Course.slug == COURSE_SLUG)).scalar_one_or_none()
    if not course:
        raise SystemExit(f"Course not found: {COURSE_SLUG}")

    query = select(Document).where(Document.course_id == course.id, Document.deleted_at.is_(None))
    if document_filename:
        query = query.where(Document.filename == document_filename)
    else:
        query = query.where(Document.filename.ilike("%深度学习%"))
    document = db.execute(query.order_by(Document.created_at.desc())).scalars().first()
    if not document:
        raise SystemExit("No deep learning PDF document found for this course.")

    rows = db.execute(
        select(DocumentChunk)
        .where(
            DocumentChunk.document_id == document.id,
            DocumentChunk.chunk_index >= 0,
            DocumentChunk.chunk_index <= MAX_TOC_CHUNK_INDEX,
        )
        .order_by(DocumentChunk.chunk_index)
    ).scalars().all()
    toc_parts: list[str] = []
    for row in rows:
        content = (row.content or "").strip()
        if not _is_outline_chunk(content):
            continue
        toc_parts.append(content)
    if not toc_parts:
        raise SystemExit(f"No TOC-like chunks found for document {document.filename!r}.")
    return document.filename or document.title, "\n".join(toc_parts)


def sync_outline(*, dry_run: bool, document_filename: str | None) -> dict:
    db = SessionLocal()
    try:
        source_name, toc_text = _collect_toc_text(db, document_filename=document_filename)
        preview = D2lPlainTocImporter().preview(toc_text, source_name=source_name)
        sections = preview["sections"]
        if dry_run:
            return {"dry_run": True, **preview}

        apply_payload = CourseOutlineApplyRequest(
            mode="replace",
            sections=sections,
            rebuild_prerequisites=True,
        )
        applied = CourseRepository(db).apply_outline_draft(COURSE_SLUG, apply_payload)
        if not applied:
            raise SystemExit("Failed to apply outline to course.")

        async def _regenerate_paths() -> int:
            learning = LearningRepository(db)
            from app.models import User

            users = db.execute(select(User).where(User.role_code == "student")).scalars().all()
            count = 0
            for user in users:
                result = learning.generate_path(COURSE_SLUG, user.external_id)
                if result.get("items"):
                    count += 1
            return count

        paths_regenerated = asyncio.run(_regenerate_paths())
        db.commit()
        return {
            "dry_run": False,
            "applied": applied,
            "paths_regenerated": paths_regenerated,
            **preview,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--document-filename", default=None)
    args = parser.parse_args()
    result = sync_outline(dry_run=args.dry_run, document_filename=args.document_filename)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
