from __future__ import annotations

from typing import Any


RESOURCE_TASK_ACTIVE_STATUSES = {"planning", "retrieving", "generating", "verifying", "safety_checking"}
RESOURCE_TASK_TERMINAL_STATUSES = {"completed", "failed", "cancelled"}
RESOURCE_TASK_LEGACY_ACTIVE_STATUSES = {"running"}
RESOURCE_TASK_LEGACY_COMPLETED_STATUSES = {"succeeded"}

GENERATOR_AGENT_BY_TYPE = {
    "quiz": "ExerciseAgent",
    "misconception_card": "ExerciseAgent",
    "code_lab": "CodeAgent",
    "mindmap": "VisualAgent",
    "video": "VisualAgent",
    "diagram_pack": "ImageAgent",
}

FULL_WORKFLOW_BY_TYPE = {
    "quiz": ["IntentAgent", "ProfileAgent", "PlannerAgent", "RetrieverAgent", "ExerciseAgent", "VerifyAgent", "SafetyAgent"],
    "misconception_card": ["IntentAgent", "ProfileAgent", "PlannerAgent", "ExerciseAgent", "VerifyAgent", "SafetyAgent"],
    "code_lab": ["IntentAgent", "ProfileAgent", "PlannerAgent", "RetrieverAgent", "CodeAgent", "VerifyAgent", "SafetyAgent"],
    "mindmap": ["IntentAgent", "ProfileAgent", "PlannerAgent", "RetrieverAgent", "VisualAgent", "VerifyAgent", "SafetyAgent"],
    "video": ["IntentAgent", "ProfileAgent", "VisualAgent", "WriterAgent", "VerifyAgent", "SafetyAgent"],
    "diagram_pack": ["IntentAgent", "ProfileAgent", "PlannerAgent", "RetrieverAgent", "ImageAgent", "SafetyAgent"],
}


def task_orchestration(task: Any) -> dict[str, Any]:
    """读取任务编排元数据，兼容迁移前创建的旧任务。"""
    value = getattr(task, "orchestration_json", None)
    return value if isinstance(value, dict) else {}


def task_requires_course_evidence(task: Any) -> bool:
    """判断资源生成任务是否必须先命中课程资料依据。"""
    orchestration = task_orchestration(task)
    if "needCourseEvidence" in orchestration:
        return bool(orchestration.get("needCourseEvidence"))
    if "need_course_evidence" in orchestration:
        return bool(orchestration.get("need_course_evidence"))
    return bool(getattr(task, "course_id", None))


def task_material_document_id(task: Any) -> str | None:
    """读取资源生成任务绑定的资料文档 ID。"""
    orchestration = task_orchestration(task)
    client_context = orchestration.get("clientContext") or orchestration.get("client_context")
    if not isinstance(client_context, dict):
        return None
    material = client_context.get("material")
    candidates = [
        client_context.get("documentId"),
        client_context.get("document_id"),
    ]
    if isinstance(material, dict):
        candidates.extend([material.get("documentId"), material.get("document_id")])
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def image_context_from_client_context(client_context: dict[str, Any] | None) -> dict[str, Any]:
    """读取前端传入的图片生成上下文。"""
    if not isinstance(client_context, dict):
        return {}
    image_context = client_context.get("image")
    return image_context if isinstance(image_context, dict) else {}


def image_context_from_payload(payload: Any) -> dict[str, Any]:
    """读取创建任务请求中的图片生成参数。"""
    return image_context_from_client_context(getattr(payload, "client_context", None))


def course_image_provider(course: Any | None) -> str | None:
    """读取课程级图片生成供应商绑定。"""
    if not course:
        return None
    value = (getattr(course, "model_config_json", None) or {}).get("image_provider")
    return str(value).strip() if value else None


def image_provider_from_payload(payload: Any, course: Any | None) -> str | None:
    """解析任务创建时应使用的图片生成供应商。"""
    value = image_context_from_payload(payload).get("providerCode")
    return str(value).strip() if value else course_image_provider(course)


def image_context_from_task(task: Any) -> dict[str, Any]:
    """读取任务编排元数据中的图片生成参数。"""
    orchestration = task_orchestration(task)
    client_context = orchestration.get("clientContext") or orchestration.get("client_context")
    return image_context_from_client_context(client_context if isinstance(client_context, dict) else None)


def image_provider_from_task(task: Any, course: Any | None) -> str | None:
    """解析任务执行时应使用的图片生成供应商。"""
    value = image_context_from_task(task).get("providerCode")
    return str(value).strip() if value else course_image_provider(course)


def generator_agent(resource_type: str) -> str:
    """按资源类型选择对外展示的生成智能体。"""
    return GENERATOR_AGENT_BY_TYPE.get(resource_type, "WriterAgent")


def workflow_agents(resource_type: str, *, need_course_evidence: bool, course_scope: bool) -> list[str]:
    """生成资源任务的概念智能体序列，用于 trace 和前端展示。"""
    base = FULL_WORKFLOW_BY_TYPE.get(
        resource_type,
        ["IntentAgent", "ProfileAgent", "PlannerAgent", "RetrieverAgent", generator_agent(resource_type), "VerifyAgent", "SafetyAgent"],
    )
    if need_course_evidence or not course_scope:
        return base if course_scope else [agent for agent in base if agent != "RetrieverAgent"]
    return [agent for agent in base if agent != "RetrieverAgent"]


def initial_task_steps(resource_type: str, *, course_scope: bool, need_course_evidence: bool, topic: str | None = None) -> list[dict[str, Any]]:
    """构造当前执行节点使用的任务步骤。"""
    generator = generator_agent(resource_type)
    if resource_type == "diagram_pack":
        return [
            {
                "name": "RetrieverAgent · 课程资料检索",
                "phase": "retrieving",
                "status": "queued",
                "detail": None if course_scope and need_course_evidence else "未要求课程资料依据，将跳过检索",
            },
            {"name": "PlannerAgent · 图解脚本规划", "phase": "planning", "status": "queued", "detail": topic},
            {"name": "ImageAgent · 批量真实出图", "phase": "generating", "status": "queued", "detail": "默认生成概念示意图、流程图、易错对比图"},
            {"name": "SafetyAgent · 图片包安全审查", "phase": "safety_checking", "status": "queued", "detail": None},
            {"name": "ArtifactAgent · 保存图片资产", "phase": "completed", "status": "queued", "detail": None},
        ]
    if course_scope:
        return [
            {
                "name": "RetrieverAgent · 课程资料检索",
                "phase": "retrieving",
                "status": "queued",
                "detail": None if need_course_evidence else "未要求课程资料依据，将跳过检索",
            },
            {"name": "ProfileAgent · 学习画像适配", "phase": "planning", "status": "queued", "detail": None},
            {"name": f"{generator} · 资源正文生成", "phase": "generating", "status": "queued", "detail": None},
            {"name": "VerifyAgent · 引用与格式核验", "phase": "verifying", "status": "queued", "detail": None},
            {"name": "SafetyAgent · 安全审查", "phase": "safety_checking", "status": "queued", "detail": None},
            {"name": "ArtifactAgent · 保存资源版本", "phase": "completed", "status": "queued", "detail": None},
        ]
    return [
        {"name": "IntentAgent · 通用主题确认", "phase": "planning", "status": "queued", "detail": topic},
        {"name": f"{generator} · 资源正文生成", "phase": "generating", "status": "queued", "detail": None},
        {"name": "SafetyAgent · 安全审查", "phase": "safety_checking", "status": "queued", "detail": None},
        {"name": "ArtifactAgent · 保存资源版本", "phase": "completed", "status": "queued", "detail": None},
    ]


def step_phase(steps: list[dict[str, Any]], index: int) -> str:
    """读取步骤对应的对外任务阶段。"""
    if 0 <= index < len(steps):
        phase = str(steps[index].get("phase") or "").strip()
        if phase:
            return phase
    return "generating"


def update_task_step_state(
    steps: list[dict[str, Any]],
    index: int,
    status: str,
    *,
    detail: str | None = None,
    citations: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], str | None]:
    """更新任务步骤状态，并返回需要同步到任务本体的状态。

    参数:
        steps: 当前任务步骤列表。
        index: 需要更新的步骤下标。
        status: 目标步骤状态。
        detail: 步骤详情说明，允许为空。
        citations: 步骤关联引用依据，未传入时不覆盖原有引用。

    返回:
        二元组，第一项为更新后的步骤列表，第二项为任务本体状态；当步骤状态不需要改变任务本体状态时返回 None。
    """
    updated_steps: list[dict[str, Any]] = []
    for position, step in enumerate(steps):
        next_step = dict(step)
        if position < index and next_step.get("status") in {"queued", "running"}:
            next_step["status"] = "completed"
        updated_steps.append(next_step)

    if 0 <= index < len(updated_steps):
        next_step = {**updated_steps[index], "status": status, "detail": detail}
        if citations is not None:
            next_step["citations"] = citations
        updated_steps[index] = next_step

    if status == "running":
        phase = step_phase(updated_steps, index)
        return updated_steps, phase if phase in RESOURCE_TASK_ACTIVE_STATUSES else "generating"
    if status in {"failed", "blocked"}:
        return updated_steps, "failed"
    if status == "cancelled":
        return updated_steps, "cancelled"
    return updated_steps, None


def cancelled_task_steps(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """把未完成的任务步骤标记为已取消，保留已完成或已失败步骤的原状态。"""
    return [
        {**step, "status": "cancelled" if step.get("status") in {"queued", "running"} else step.get("status", "completed")}
        for step in steps
    ]


def failed_task_steps(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """把正在执行的步骤标记为失败，其余步骤保持原状态或回落为 queued。"""
    return [
        {**step, "status": "failed" if step.get("status") == "running" else step.get("status", "queued")}
        for step in steps
    ]


def current_agent_from_steps(steps: list[dict[str, Any]]) -> str | None:
    """从步骤列表中推导当前智能体名称。"""
    for step in steps:
        if step.get("status") == "running":
            return str(step.get("name") or "").split("·", 1)[0].strip() or None
    for step in reversed(steps):
        if step.get("status") in {"failed", "blocked", "cancelled"}:
            return str(step.get("name") or "").split("·", 1)[0].strip() or None
    return None


def normalized_task_status(task: Any) -> str:
    """将旧任务状态映射为 docs 05 的对外状态枚举。"""
    status = str(getattr(task, "status", "") or "queued")
    if status in RESOURCE_TASK_LEGACY_COMPLETED_STATUSES:
        return "completed"
    if status in RESOURCE_TASK_LEGACY_ACTIVE_STATUSES:
        steps = [step for step in (getattr(task, "steps_json", None) or []) if isinstance(step, dict)]
        for index, step in enumerate(steps):
            if step.get("status") == "running":
                return step_phase(steps, index)
        return "generating"
    return status


def task_error_code(message: str | None) -> str | None:
    """将内部错误归类为前端可用的错误码。"""
    if not message:
        return None
    lowered = str(message).lower()
    if "course evidence unavailable" in lowered:
        return "course_evidence_unavailable"
    if "safety_blocked" in lowered or "安全审查" in str(message):
        return "safety_blocked"
    if "ai_model_unavailable" in lowered or "model gateway" in lowered or "missing api key" in lowered or "chatprovider" in lowered:
        return "chat_provider_unavailable"
    if "imageprovider" in lowered or "image provider" in lowered or "图片生成" in str(message):
        return "image_provider_unavailable"
    if "cancelled" in lowered or "已取消" in str(message):
        return "cancelled"
    if "rate limit" in lowered or "429" in lowered:
        return "rate_limited"
    return "resource_generation_failed"


def safe_personalization_summary(personalization: dict[str, Any] | None) -> dict[str, Any]:
    """返回可展示的画像适配摘要，避免泄露完整画像快照。"""
    if not isinstance(personalization, dict):
        return {}
    return {
        "learnerLevel": personalization.get("learnerLevel"),
        "weakPoints": list(personalization.get("weakPoints") or [])[:5],
        "adaptationReason": personalization.get("adaptationReason"),
        "effectiveResourceType": personalization.get("effectiveResourceType"),
    }
