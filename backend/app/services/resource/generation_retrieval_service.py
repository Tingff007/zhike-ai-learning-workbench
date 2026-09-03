from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.models import Course, CourseConcept, ResourceGenerationTask
from app.services.rag.retriever import CourseRetriever
from app.services.resource import task_metadata
from app.services.resource.prompts import TYPE_LABELS


COURSE_EVIDENCE_FALLBACK_DETAIL = "未命中可用课程资料依据，已改用课程上下文和大模型直接生成，不返回模拟引用"
logger = logging.getLogger(__name__)


class TaskStepUpdater(Protocol):
    """资源生成任务步骤更新回调。"""

    def __call__(
        self,
        task: ResourceGenerationTask,
        index: int,
        status: str,
        detail: str | None = None,
        progress: int | None = None,
        citations: list[dict[str, Any]] | None = None,
    ) -> None:
        """更新任务步骤状态。"""


class DraftUpdater(Protocol):
    """资源生成任务草稿更新回调。"""

    def __call__(self, task: ResourceGenerationTask, content: str, progress: int | None = None) -> None:
        """更新任务草稿内容和可选进度。"""


class ResourceGenerationRetrievalService:
    """封装课程资源生成的 RAG 检索节点。"""

    def __init__(
        self,
        db: Session,
        *,
        update_task_step: TaskStepUpdater,
        update_task_draft: DraftUpdater,
        retriever: CourseRetriever | None = None,
    ) -> None:
        """初始化资源生成检索服务。

        参数:
            db: 当前请求范围内的数据库会话。
            update_task_step: 任务步骤状态更新回调。
            update_task_draft: 任务草稿更新回调。
            retriever: 可选课程检索器，测试可注入替身。
        """

        self.db = db
        self._update_task_step = update_task_step
        self._update_task_draft = update_task_draft
        self._retriever = retriever or CourseRetriever()

    async def retrieve_node(self, state: Mapping[str, Any]) -> dict[str, Any]:
        """执行课程资料检索节点，并把引用依据写入任务草稿上下文。"""

        task: ResourceGenerationTask = state["task"]
        course: Course = state["course"]
        concept: CourseConcept | None = state.get("concept")
        if not task_metadata.task_requires_course_evidence(task):
            self._update_task_step(task, 0, "completed", "未要求课程资料依据，跳过检索", 32, citations=[])
            self._update_generation_draft_header(task, course, concept)
            return {"citations": [], "task": task}

        query = " ".join(filter(None, [concept.title if concept else None, task.goal, task.requirements]))
        self._update_task_step(task, 0, "running", "正在执行课程 RAG 检索", 18)
        try:
            citations = await self._retriever.retrieve(
                self.db,
                course.slug,
                query,
                concept.code if concept else None,
                document_id=task_metadata.task_material_document_id(task),
            )
        except Exception:
            logger.warning(
                "课程资源生成检索失败，已降级为无引用生成：course_slug=%s concept_code=%s task_id=%s",
                course.slug,
                concept.code if concept else None,
                getattr(task, "id", None),
                exc_info=True,
            )
            self._update_task_step(task, 0, "completed", COURSE_EVIDENCE_FALLBACK_DETAIL, 32, citations=[])
            self._update_generation_draft_header(task, course, concept)
            return {"citations": [], "task": task}
        citation_dicts = [self._citation_to_dict(citation) for citation in citations]
        if not citation_dicts:
            self._update_task_step(task, 0, "completed", COURSE_EVIDENCE_FALLBACK_DETAIL, 32, citations=[])
            self._update_generation_draft_header(task, course, concept)
            return {"citations": [], "task": task}
        self._update_task_step(task, 0, "completed", f"命中 {len(citation_dicts)} 条引用", 32, citations=citation_dicts)
        self._update_generation_draft_header(task, course, concept)
        return {"citations": citation_dicts, "task": task}

    def _update_generation_draft_header(
        self,
        task: ResourceGenerationTask,
        course: Course,
        concept: CourseConcept | None,
    ) -> None:
        """写入检索节点完成后的草稿标题占位，提示前端资源正在生成。"""

        concept_title = concept.title if concept else course.title
        resource_label = TYPE_LABELS.get(task.resource_type, task.resource_type)
        self._update_task_draft(
            task,
            f"# {concept_title}\n\n_正在生成{resource_label}…_\n",
            36,
        )

    @staticmethod
    def _citation_to_dict(citation: Any) -> dict[str, Any]:
        """把检索器返回的引用对象规范化为字典。"""

        if hasattr(citation, "model_dump"):
            return citation.model_dump()
        if isinstance(citation, dict):
            return dict(citation)
        return {
            "source_title": getattr(citation, "source_title", None),
            "page_no": getattr(citation, "page_no", None),
            "snippet": getattr(citation, "snippet", "") or "",
            "content": getattr(citation, "content", None),
        }
