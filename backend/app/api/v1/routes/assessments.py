import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db
from app.core.deps import CurrentUser, ensure_course_access, get_current_user
from app.core.tracing import get_trace_id
from app.models import Course, CourseConcept, PathNode
from app.schemas.assessment import AssessmentDraftRequest, AssessmentDraftResponse, AssessmentQueuedResponse, AssessmentResult, AssessmentSubmitRequest
from app.services.model_gateway.errors import ModelGatewayBudgetLimitError
from app.services.assessment.evaluator import AssessmentEvaluator
from app.services.resource.quiz_contract import (
    QuizContractError,
    build_fallback_quiz_payload,
    build_quiz_generation_messages,
    build_quiz_repair_message,
    load_quiz_json_object,
    normalize_quiz_payload_with_fallbacks,
    parse_quiz_json_payload,
    render_quiz_markdown,
)

router = APIRouter()
evaluator = AssessmentEvaluator()
_ASSESSMENT_IDEMPOTENCY_CACHE: dict[str, tuple[datetime, AssessmentQueuedResponse]] = {}
logger = logging.getLogger(__name__)


async def _run_assessment_task(payload: AssessmentSubmitRequest, user_external_id: str) -> None:
    """在后台任务中执行评测，并独立管理数据库会话。"""
    db = SessionLocal()
    try:
        await evaluator.evaluate(payload, db, user_external_id)
    finally:
        db.close()


def _cached_assessment_response(key: str | None) -> AssessmentQueuedResponse | None:
    """读取短期幂等缓存，并清理过期评测任务记录。"""
    if not key:
        return None
    now = datetime.now(timezone.utc)
    expired = [item_key for item_key, (created_at, _) in _ASSESSMENT_IDEMPOTENCY_CACHE.items() if now - created_at > timedelta(seconds=30)]
    for item_key in expired:
        _ASSESSMENT_IDEMPOTENCY_CACHE.pop(item_key, None)
    cached = _ASSESSMENT_IDEMPOTENCY_CACHE.get(key)
    return cached[1] if cached else None


def _resolve_course_concept(
    db: Session,
    *,
    course: Course,
    concept_ref: str,
    path_node_ref: str | None,
) -> CourseConcept | None:
    """兼容知识点 code、UUID 和路径节点 code 三类测评入口。"""

    concept = db.execute(
        select(CourseConcept).where(CourseConcept.course_id == course.id, CourseConcept.code == concept_ref)
    ).scalar_one_or_none()
    if concept:
        return concept

    concept_uuid = _safe_uuid(concept_ref)
    if concept_uuid is None:
        concept = None
    else:
        concept = db.execute(
            select(CourseConcept).where(CourseConcept.course_id == course.id, CourseConcept.id == concept_uuid)
        ).scalar_one_or_none()
    if concept:
        return concept

    if not path_node_ref:
        return None
    return db.execute(
        select(CourseConcept)
        .join(PathNode, PathNode.concept_id == CourseConcept.id)
        .where(
            PathNode.course_id == course.id,
            PathNode.code == path_node_ref,
            CourseConcept.course_id == course.id,
        )
    ).scalar_one_or_none()


def _safe_uuid(value: str) -> UUID | None:
    """仅在输入确实是 UUID 时返回 UUID 对象，避免业务 code 触发数据库类型转换错误。"""

    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


@router.post("", response_model=AssessmentResult)
async def submit_assessment(payload: AssessmentSubmitRequest, current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)) -> AssessmentResult:
    """同步提交评测答案并返回评测结果。"""
    return await evaluator.evaluate(payload, db, current_user.id)


@router.post("/draft", response_model=AssessmentDraftResponse)
async def generate_assessment_draft(
    payload: AssessmentDraftRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssessmentDraftResponse:
    """按课程知识点实时生成结构化阶段测评题。"""

    course = db.execute(select(Course).where(Course.slug == payload.course_id)).scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在，无法生成阶段测评题")
    ensure_course_access(db, current_user, payload.course_id)
    concept = _resolve_course_concept(
        db,
        course=course,
        concept_ref=payload.concept_id,
        path_node_ref=payload.path_node_id,
    )
    if not concept:
        raise HTTPException(status_code=404, detail="知识点不存在，无法生成阶段测评题")
    evidence = f"- {concept.title}：{concept.definition or '请围绕该知识点的定义、适用场景、关键步骤和常见误区命题。'}"
    messages = build_quiz_generation_messages(
        course_title=course.title,
        concept_title=concept.title,
        difficulty_label=payload.difficulty,
        goal=f"为「{concept.title}」生成一组可在线作答的阶段测评题",
        requirements=payload.requirements,
        profile_summary="用于独立阶段测评，题目必须聚焦课程知识点，不要生成占位式泛化题。",
        mastery_context="请覆盖概念理解、辨析、应用和主观表达。",
        recent_dialog=None,
        evidence=evidence,
    )
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            from app.services.model_gateway.router import ModelGateway

            result = await ModelGateway(db).complete_chat(
                messages=messages,
                course_slug=course.slug,
                agent_name="AssessmentDraftAgent",
                temperature=0.05,
                max_tokens=2400,
                json_mode=True,
            )
            raw_answer = result.answer
            try:
                quiz = parse_quiz_json_payload(raw_answer)
                source = "ai_structured_quiz"
            except Exception as strict_exc:
                raw_json = load_quiz_json_object(raw_answer)
                if raw_json is None:
                    raise
                quiz = normalize_quiz_payload_with_fallbacks(
                    raw_json,
                    concept_title=concept.title,
                    concept_definition=concept.definition,
                )
                source = "ai_repaired_quiz"
                logger.info(
                    "阶段测评题已从模型半结构化输出修复为可评分题单：course_slug=%s concept_code=%s error=%s trace_id=%s",
                    course.slug,
                    concept.code,
                    str(strict_exc),
                    get_trace_id(),
                )
            return AssessmentDraftResponse(
                title=str(quiz["title"]),
                content=render_quiz_markdown(quiz),
                course_id=payload.course_id,
                concept_id=payload.concept_id,
                path_node_id=payload.path_node_id,
                source=source,
            )
        except ModelGatewayBudgetLimitError:
            raise
        except QuizContractError as exc:
            last_error = exc
            failed_answer = locals().get("raw_answer", "")
            logger.warning(
                "阶段测评题未通过结构化校验，准备修复重试：course_slug=%s concept_code=%s attempt=%s error=%s answer_length=%s trace_id=%s",
                course.slug,
                concept.code,
                attempt + 1,
                str(exc),
                len(str(failed_answer or "")),
                get_trace_id(),
            )
            messages = [*messages, build_quiz_repair_message(raw_answer=str(failed_answer), error=exc)]
        except Exception as exc:
            last_error = exc
            failed_answer = locals().get("raw_answer", "")
            logger.warning(
                "阶段测评题生成出现非预期异常，准备降级处理：course_slug=%s concept_code=%s attempt=%s error=%s trace_id=%s",
                course.slug,
                concept.code,
                attempt + 1,
                str(exc),
                get_trace_id(),
                exc_info=True,
            )
            if failed_answer:
                messages = [*messages, build_quiz_repair_message(raw_answer=str(failed_answer), error=exc)]
            else:
                messages = [
                    *messages,
                    {
                        "role": "user",
                        "content": (
                            f"上一次输出未通过校验或调用失败：{str(exc)[:300]}。"
                            "请重新只输出一个满足契约的纯 JSON 对象，首字符为 {，末字符为 }，不要输出 Markdown 或解释。"
                        ),
                    },
                ]
    fallback = build_fallback_quiz_payload(concept_title=concept.title, concept_definition=concept.definition)
    logger.warning(
        "阶段测评题连续生成失败，已返回服务端标准化兜底题单：course_slug=%s concept_code=%s error=%s trace_id=%s",
        course.slug,
        concept.code,
        str(last_error),
        get_trace_id(),
    )
    return AssessmentDraftResponse(
        title=str(fallback["title"]),
        content=render_quiz_markdown(fallback),
        course_id=payload.course_id,
        concept_id=payload.concept_id,
        path_node_id=payload.path_node_id,
        source="server_fallback_quiz",
    )


@router.post("/submit", response_model=AssessmentQueuedResponse)
async def submit_assessment_task(
    payload: AssessmentSubmitRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
    x_idempotency_key: str | None = Header(default=None, alias="X-Idempotency-Key"),
) -> AssessmentQueuedResponse:
    """异步提交评测任务，支持短期幂等键避免重复排队。"""
    cached = _cached_assessment_response(x_idempotency_key)
    if cached:
        return cached

    response = AssessmentQueuedResponse(
        status="processing",
        task_id=f"task_eval_{uuid4()}",
        submitted_at=datetime.now(timezone.utc),
    )
    if x_idempotency_key:
        _ASSESSMENT_IDEMPOTENCY_CACHE[x_idempotency_key] = (response.submitted_at, response)
    background_tasks.add_task(_run_assessment_task, payload, current_user.id)
    return response
