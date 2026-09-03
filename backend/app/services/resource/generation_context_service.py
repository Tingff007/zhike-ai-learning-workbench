from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ConceptMastery, Conversation, Course, CourseConcept, Message, ResourceGenerationTask, User
from app.services.profile.repository import LearningProfileRepository


class TaskStepUpdater(Protocol):
    """资源生成任务步骤更新回调，用于避免上下文服务直接依赖仓储实现。"""

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


class ResourceGenerationContextService:
    """收集资源生成所需的学习画像、掌握度和近期对话上下文。"""

    def __init__(self, db: Session, *, update_task_step: TaskStepUpdater) -> None:
        """初始化资源生成上下文服务。

        参数:
            db: 当前请求范围内的数据库会话。
            update_task_step: 任务步骤更新回调，用于将画像节点进度写回任务。
        """

        self.db = db
        self._update_task_step = update_task_step

    def resolve_profile_state(self, state: Mapping[str, Any]) -> dict[str, Any]:
        """执行学习画像节点，并返回供后续生成节点使用的上下文增量。

        参数:
            state: 当前资源生成工作流状态，至少包含 task，可选包含 course。

        返回:
            包含画像摘要、掌握度摘要、近期对话和任务实体的状态增量。
        """

        task = state["task"]
        course = state.get("course")
        profile_summary = self.profile_summary_for_task(
            task,
            course if isinstance(course, Course) else None,
            default_summary="暂无画像摘要，使用课程默认学习者画像。",
        )
        mastery_context = self.mastery_context_for_task(task)
        recent_dialog = self.recent_dialog_for_task(task)
        step_detail = profile_summary[:120] if profile_summary else "暂无画像"
        self._update_task_step(task, 1, "completed", step_detail, 42)
        return {
            "profile_summary": profile_summary,
            "profile_context_snapshot": profile_summary,
            "mastery_context": mastery_context,
            "recent_dialog": recent_dialog,
            "task": task,
        }

    def profile_summary_for_task(
        self,
        task: ResourceGenerationTask,
        course: Course | None,
        *,
        default_summary: str,
    ) -> str:
        """解析资源生成任务的学习画像摘要。

        参数:
            task: 当前资源生成任务。
            course: 可选课程实体，用于课程内画像上下文。
            default_summary: 缺少用户或画像时使用的默认摘要。

        返回:
            可直接写入模型 Prompt 的学习画像摘要。
        """

        if not task.requested_by_user_id:
            return default_summary
        user = self.db.get(User, task.requested_by_user_id)
        if not user:
            return default_summary
        profile_context = LearningProfileRepository(self.db).resolve_context(
            user_external_id=user.external_id,
            course_id=course.slug if course else None,
            message=task.goal,
            task_type="resource_generation",
            resource_type=task.resource_type,
        )
        return profile_context.format_for_prompt()

    def mastery_context_for_task(self, task: ResourceGenerationTask) -> str:
        """读取任务相关用户在当前课程下掌握度最低的知识点摘要。"""

        if not task.requested_by_user_id:
            return ""
        rows = self.db.execute(
            select(CourseConcept.title, ConceptMastery.mastery)
            .join(ConceptMastery, ConceptMastery.concept_id == CourseConcept.id)
            .where(
                ConceptMastery.course_id == task.course_id,
                ConceptMastery.user_id == task.requested_by_user_id,
            )
            .order_by(ConceptMastery.mastery.asc())
            .limit(6)
        ).all()
        if not rows:
            return ""
        return "\n".join(f"- {title}：掌握度 {mastery}%" for title, mastery in rows)

    def recent_dialog_for_task(self, task: ResourceGenerationTask) -> str:
        """读取任务发起用户在当前课程中的近期对话片段。"""

        if not task.requested_by_user_id:
            return ""
        user = self.db.get(User, task.requested_by_user_id)
        if not user:
            return ""
        messages = self.db.execute(
            select(Message.role, Message.content)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(Conversation.course_id == task.course_id, Conversation.user_id == user.id)
            .order_by(Message.created_at.desc())
            .limit(6)
        ).all()
        if not messages:
            return ""
        lines: list[str] = []
        for role, content in reversed(messages):
            text = (content or "").strip().replace("\n", " ")[:200]
            if text:
                lines.append(f"- {role}：{text}")
        return "\n".join(lines)
