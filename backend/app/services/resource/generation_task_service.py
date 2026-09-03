from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.tracing import get_trace_id
from app.models import Course, CourseConcept, PathNode, Resource, ResourceGenerationTask, User
from app.schemas.resource import ResourceGenerateRequest
from app.services.knowledge.iflytek.course_chat_binding import resolve_course_chatdoc_binding
from app.services.learning.events import LearningEventRecorder
from app.services.model_gateway.router import ModelGateway
from app.services.resource import task_metadata
from app.services.resource.image_generation import ImageGenerationService
from app.services.resource.progress_events import publish_resource_task_progress
from app.services.resource.task_payloads import ResourceTaskPayloadService, ResourceTaskProgressPublisher


logger = logging.getLogger(__name__)

ChatProviderChecker = Callable[[Course | None], bool]
CourseEvidenceChecker = Callable[[Course | None, CourseConcept | None], bool]


def _safe_uuid(value: str | None) -> uuid.UUID | None:
    """把外部字符串转换为 UUID，非法输入按空值处理。"""
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


class ResourceGenerationTaskService:
    """封装资源生成任务的创建、重跑和终态持久化。"""

    def __init__(
        self,
        db: Session,
        *,
        task_payload_service: ResourceTaskPayloadService,
        progress_publisher: ResourceTaskProgressPublisher = publish_resource_task_progress,
        chat_provider_checker: ChatProviderChecker | None = None,
        course_evidence_checker: CourseEvidenceChecker | None = None,
    ) -> None:
        """初始化资源生成任务命令服务。

        参数:
            db: 当前请求或后台任务使用的数据库会话。
            task_payload_service: 任务序列化和进度事件发布服务。
            progress_publisher: 任务进度事件发布函数，测试可注入空实现。
            chat_provider_checker: 可选 ChatProvider 可用性检查函数，仓储门面可注入兼容旧测试替换点。
            course_evidence_checker: 可选课程资料可用性检查函数，仓储门面可注入兼容旧测试替换点。
        """

        self.db = db
        self._task_payload_service = task_payload_service
        self._progress_publisher = progress_publisher
        self._chat_provider_checker = chat_provider_checker or self.chat_provider_available
        self._course_evidence_checker = course_evidence_checker or self.course_evidence_available

    def create_generation_task(self, payload: ResourceGenerateRequest, user_external_id: str | None = None) -> dict[str, Any]:
        """创建资源生成任务，并在依赖不可用时返回可追踪的失败任务。"""

        is_course_scope = payload.scope == "course" or bool(payload.course_id)
        course = self._course(payload.course_id) if payload.course_id else None
        if is_course_scope and not course:
            error_fields = self._task_payload_service.task_error_fields("course not found")
            return {
                "status": "failed",
                "message": error_fields["error_message"],
                "error_code": "course_not_found",
                **error_fields,
                "task_id": "",
                "course_id": payload.course_id,
                "scope": "course",
                "resource_type": payload.resource_type,
                "progress": 0,
                "steps": [],
                "need_course_evidence": bool(payload.need_course_evidence),
                "course_evidence_required": bool(payload.need_course_evidence),
            }

        concept = self._concept(course, payload.concept_id) if course else None
        path_node = self._path_node(payload.path_node_id)
        user = self._user(user_external_id)
        need_course_evidence = bool(course and payload.need_course_evidence)
        image_provider_code = task_metadata.image_provider_from_payload(payload, course)
        if payload.resource_type == "diagram_pack" and not ImageGenerationService(self.db).has_configured_provider(
            image_provider_code
        ):
            message = "ImageProvider 未配置，教学图解包无法真实出图；请先在模型网关配置图片生成供应商或设置 OPENAI_API_KEY。"
            return self.create_failed_generation_task(
                payload,
                user,
                course,
                concept,
                path_node,
                message=message,
                need_course_evidence=need_course_evidence,
            )
        if not self._chat_provider_checker(course):
            message = "ChatProvider 未配置，资源生成不可用；请先在模型网关配置可用 Chat 模型。"
            return self.create_failed_generation_task(
                payload,
                user,
                course,
                concept,
                path_node,
                message=message,
                need_course_evidence=need_course_evidence,
            )
        steps = task_metadata.initial_task_steps(
            payload.resource_type,
            course_scope=bool(course),
            need_course_evidence=need_course_evidence,
            topic=payload.topic or payload.goal,
        )
        task = ResourceGenerationTask(
            course_id=course.id if course else None,
            concept_id=concept.id if concept else None,
            path_node_id=path_node.id if path_node else None,
            requested_by_user_id=user.id if user else None,
            resource_type=payload.resource_type,
            difficulty=payload.difficulty,
            goal=payload.goal,
            requirements=payload.requirements,
            status="queued",
            progress=5,
            steps_json=steps,
            orchestration_json=self._build_orchestration(
                payload,
                course=course,
                need_course_evidence=need_course_evidence,
            ),
        )
        self.db.add(task)
        self.db.flush()
        if course:
            LearningEventRecorder(self.db).record(
                course_id=course.id,
                user_id=user.id if user else None,
                concept_id=concept.id if concept else None,
                event_type="resource_generation_requested",
                source_type="resource_generation_task",
                source_id=str(task.id),
                evidence={
                    "resource_type": payload.resource_type,
                    "difficulty": payload.difficulty,
                    "goal": payload.goal,
                    "path_node_id": path_node.code if path_node else payload.path_node_id,
                    "scope": "course",
                    "need_course_evidence": bool(payload.need_course_evidence),
                    "next_state": "queued",
                },
            )
        self.db.commit()
        self.db.refresh(task)
        return self._serialize_task(task, course.slug if course else None)

    def create_failed_generation_task(
        self,
        payload: ResourceGenerateRequest,
        user: User | None,
        course: Course | None,
        concept: CourseConcept | None,
        path_node: PathNode | None,
        *,
        message: str,
        need_course_evidence: bool,
    ) -> dict[str, Any]:
        """创建失败态资源生成任务，保留前端可展示的失败原因和重试入口。"""

        steps = task_metadata.initial_task_steps(
            payload.resource_type,
            course_scope=bool(course),
            need_course_evidence=need_course_evidence,
            topic=payload.topic or payload.goal,
        )
        if steps:
            failed_index = 0 if need_course_evidence else min(1, len(steps) - 1)
            steps[failed_index] = {**steps[failed_index], "status": "failed", "detail": message}
        task = ResourceGenerationTask(
            course_id=course.id if course else None,
            concept_id=concept.id if concept else None,
            path_node_id=path_node.id if path_node else None,
            requested_by_user_id=user.id if user else None,
            resource_type=payload.resource_type,
            difficulty=payload.difficulty,
            goal=payload.goal,
            requirements=payload.requirements,
            status="failed",
            progress=0,
            steps_json=steps,
            orchestration_json=self._build_orchestration(
                payload,
                course=course,
                need_course_evidence=need_course_evidence,
            ),
            error_message=message,
        )
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return self._serialize_task(task, course.slug if course else None)

    def rerun_generation_task(
        self,
        task_id: str,
        need_course_evidence: bool | None = None,
        user_external_id: str | None = None,
        *,
        is_admin: bool = False,
    ) -> dict[str, Any] | None:
        """重置资源生成任务，并允许覆盖课程资料依据策略。"""

        task = self.db.get(ResourceGenerationTask, _safe_uuid(task_id))
        if not task:
            return None
        if user_external_id is not None or is_admin:
            self._ensure_task_access(task, user_external_id, is_admin=is_admin)
        course = self.db.get(Course, task.course_id) if task.course_id else None
        concept = self.db.get(CourseConcept, task.concept_id) if task.concept_id else None
        require_evidence = bool(
            course
            and (
                need_course_evidence
                if need_course_evidence is not None
                else task_metadata.task_requires_course_evidence(task)
            )
        )
        if not self._chat_provider_checker(course):
            task.status = "failed"
            task.error_message = "ChatProvider 未配置，资源生成不可用；请先在模型网关配置可用 Chat 模型。"
            task.progress = 0
            self.db.commit()
            self.emit_task_progress(task)
            return self._serialize_task_with_course(task)
        task.status = "queued"
        task.progress = 5
        task.error_message = None
        task.draft_content = None
        task.outline_json = []
        task.result_resource_id = None
        task.locked_at = None
        task.heartbeat_at = None
        task.next_retry_at = None
        task.steps_json = task_metadata.initial_task_steps(
            task.resource_type,
            course_scope=bool(course),
            need_course_evidence=require_evidence,
            topic=task.goal,
        )
        task.orchestration_json = {
            **task_metadata.task_orchestration(task),
            "scope": "course" if course else "general",
            "needCourseEvidence": require_evidence,
            "workflowAgents": task_metadata.workflow_agents(
                task.resource_type,
                need_course_evidence=require_evidence,
                course_scope=bool(course),
            ),
        }
        self.db.add(task)
        self.db.commit()
        self.emit_task_progress(task)
        return self._serialize_task_with_course(task)

    def mark_completed(
        self,
        task: ResourceGenerationTask,
        course: Course | None,
        resource: Resource | None,
    ) -> dict[str, Any]:
        """把资源生成任务标记为完成，并记录课程学习事件。"""

        if resource:
            task.result_resource_id = resource.id
        task.status = "completed"
        task.progress = 100
        task.steps_json = [{**step, "status": "completed"} for step in (task.steps_json or [])]
        if course:
            LearningEventRecorder(self.db).record(
                course_id=course.id,
                user_id=task.requested_by_user_id,
                concept_id=task.concept_id,
                event_type="resource_generated",
                source_type="resource",
                source_id=resource.code if resource else str(task.id),
                evidence={
                    "task_id": str(task.id),
                    "resource_type": task.resource_type,
                    "quality_status": (resource.quality_check_result or {}).get("citation_coverage") if resource else None,
                    "quality_score": resource.quality_score if resource else None,
                    "safety_status": resource.safety_status if resource else None,
                    "generation_basis": resource.generation_basis_json if resource else {},
                    "next_actions": ["save_version", "submit_review", "bind_to_path"],
                },
            )
        self.db.commit()
        self.emit_task_progress(task)
        return self._serialize_task(task, course.slug if course else None)

    def mark_cancelled(self, task: ResourceGenerationTask, course: Course | None) -> dict[str, Any]:
        """把资源生成任务标记为已取消，并同步取消未完成步骤。"""

        task.status = "cancelled"
        task.error_message = "资源生成任务已取消"
        task.steps_json = task_metadata.cancelled_task_steps(task.steps_json or [])
        self.db.commit()
        self.emit_task_progress(task)
        return self._serialize_task(task, course.slug if course else None)

    def mark_failed(
        self,
        task: ResourceGenerationTask,
        course: Course | None,
        exc: Exception,
        *,
        trace_id: str | None = None,
    ) -> dict[str, Any]:
        """把资源生成任务标记为失败，并保留安全摘要和可排障 trace。"""

        failure_trace_id = trace_id or get_trace_id()
        error_text = str(exc) or "资源生成失败，请稍后重试。"
        task.status = "failed"
        task.error_message = error_text[:2000]
        task.steps_json = task_metadata.failed_task_steps(task.steps_json or [])
        if course:
            LearningEventRecorder(self.db).record(
                course_id=course.id,
                user_id=task.requested_by_user_id,
                concept_id=task.concept_id,
                event_type="resource_generation_failed",
                source_type="resource_generation_task",
                source_id=str(task.id),
                evidence={
                    "resource_type": task.resource_type,
                    "error": error_text,
                    "trace_id": failure_trace_id,
                    "next_actions": ["check_model_gateway", "review_prompt_template", "retry_generation"],
                },
            )
        self.db.commit()
        self.emit_task_progress(task)
        return self._serialize_task(task, course.slug if course else None)

    def emit_task_progress(self, task: ResourceGenerationTask) -> None:
        """发布资源生成任务进度事件。"""

        self._task_payload_service.emit_task_progress(task, publisher=self._progress_publisher)

    def chat_provider_available(self, course: Course | None) -> bool:
        """检查资源生成所需 ChatProvider 是否已配置并可调用。"""

        gateway = ModelGateway(self.db)
        provider_code = gateway.resolve_course_chat_provider(course.slug) if course else None
        return gateway.has_configured_chat_provider(provider_code)

    def course_evidence_available(self, course: Course | None, concept: CourseConcept | None = None) -> bool:
        """检查课程资料是否具备云端检索条件。"""

        if not course:
            return False
        try:
            binding = resolve_course_chatdoc_binding(self.db, course.slug, concept_code=concept.code if concept else None)
        except Exception:
            logger.warning(
                "检查课程资料可用性失败，将按不可用处理：course_slug=%s concept_code=%s",
                course.slug,
                concept.code if concept else None,
                exc_info=True,
            )
            return False
        return bool(binding and binding.knowledge_ready)

    def _course(self, slug_or_id: str | None) -> Course | None:
        """按课程 slug 或 UUID 查询课程实体。"""

        if not slug_or_id:
            return None
        return self.db.execute(
            select(Course).where(or_(Course.slug == slug_or_id, Course.id == _safe_uuid(slug_or_id)))
        ).scalar_one_or_none()

    def _concept(self, course: Course, code_or_id: str | None) -> CourseConcept | None:
        """在指定课程下按知识点 code 或 UUID 查询知识点实体。"""

        if not code_or_id:
            return None
        return self.db.execute(
            select(CourseConcept).where(
                CourseConcept.course_id == course.id,
                or_(CourseConcept.code == code_or_id, CourseConcept.id == _safe_uuid(code_or_id)),
            )
        ).scalar_one_or_none()

    def _path_node(self, node_id: str | None) -> PathNode | None:
        """按路径节点 UUID 或 code 查询学习路径节点。"""

        if not node_id:
            return None
        node_uuid = _safe_uuid(node_id)
        if node_uuid:
            return self.db.get(PathNode, node_uuid)
        return self.db.execute(select(PathNode).where(PathNode.code == node_id).order_by(PathNode.updated_at.desc())).scalars().first()

    def _user(self, external_id: str | None) -> User | None:
        """按外部用户 ID 查询用户实体。"""

        if not external_id:
            return None
        return self.db.execute(select(User).where(User.external_id == external_id)).scalar_one_or_none()

    def _ensure_task_access(self, task: ResourceGenerationTask, user_external_id: str | None, *, is_admin: bool = False) -> None:
        """校验当前用户是否可以访问或重跑资源生成任务。"""

        if is_admin:
            return
        user = self._user(user_external_id)
        if not user or task.requested_by_user_id != user.id:
            raise PermissionError("无权访问该资源生成任务")

    def _build_orchestration(
        self,
        payload: ResourceGenerateRequest,
        *,
        course: Course | None,
        need_course_evidence: bool,
    ) -> dict[str, Any]:
        """构造任务编排元数据，统一创建成功和创建失败两类任务。"""

        return {
            "scope": "course" if course else "general",
            "needCourseEvidence": need_course_evidence,
            "actionType": payload.action_type or "resource_generation",
            "clientContext": payload.client_context or {},
            "trace_id": get_trace_id(),
            "workflowAgents": task_metadata.workflow_agents(
                payload.resource_type,
                need_course_evidence=need_course_evidence,
                course_scope=bool(course),
            ),
        }

    def _serialize_task(self, task: ResourceGenerationTask, course_slug: str | None = None) -> dict[str, Any]:
        """把任务实体转换为对外响应载荷。"""

        return self._task_payload_service.task_to_dict(task, course_slug)

    def _serialize_task_with_course(self, task: ResourceGenerationTask) -> dict[str, Any]:
        """根据任务课程 ID 推断课程 slug 后序列化任务。"""

        return self._serialize_task(task, self._task_payload_service.course_slug_by_id(task.course_id))
