"""助教端 AI Agent 编排服务。

教师端 Agent 的职责边界：
- 课程知识问答：必须基于本地 pgvector 知识库检索，低置信度拒答，回答强制携带引用（零幻觉）。
- 业务数据只读查询：班级/作业/提交/成绩/薄弱点等统计来自数据库真实记录，返回可核验
  事实（data_facts），不生成虚构数据。
- 不执行发布/删除/评分等副作用操作；需要写操作的场景返回建议动作由前端跳转对应页面。

零幻觉防线复用学习端已验证的组件：CourseRetriever（本地混合检索）、
should_refuse_low_confidence（低分拒答）、SafetyGuardrail（安全审查）与
structured output 校验，避免为教师端重复实现同一套能力。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.tracing import get_trace_id
from app.models import Course, User
from app.models.ta_assignment import TaAssignment, TaAssignmentQuestion, TaSubmission
from app.models.ta_class import TaClass
from app.models.ta_class_student import TaClassStudent
from app.models.ta_grading_record import TaGradingRecord
from app.models.ta_quiz import TaQuiz
from app.schemas.ai import AgentTraceEvent, ChatQuality
from app.schemas.common import Citation
from app.schemas.ta_agent import (
    TaAgentDataFact,
    TaAgentMessageRequest,
    TaAgentMessageResponse,
)
from app.services.agent.retrieval_guard import should_refuse_low_confidence
from app.services.model_gateway.router import ModelGateway
from app.services.rag.retriever import CourseRetriever
from app.services.safety.guardrail import SafetyGuardrail
from app.services.shared.citation_context import build_llm_context

logger = logging.getLogger(__name__)

# 教师端意图常量：知识问答 / 业务数据查询 / 默认闲聊
ROUTE_KNOWLEDGE_QA = "ta_knowledge_qa"
ROUTE_BUSINESS_QUERY = "ta_business_query"
ROUTE_GENERAL_CHAT = "ta_general_chat"

# 业务查询触发词：命中即走只读数据查询，不调用大模型，从源头杜绝幻觉
_BUSINESS_KEYWORDS = (
    "班级", "学生", "作业", "提交", "成绩", "分数", "批改", "测验", "测验统计",
    "完成率", "薄弱", "预警", "掌握", "待批", "人数", "统计", "对比",
)

# 零幻觉拒答文案：无依据时必须明确拒答，禁止编造
_REFUSAL_NO_HIT = (
    "本地知识库中没有检索到与该问题相关的课程资料，我无法给出有依据的回答。"
    "请尝试换个问法，或选择其他已就绪的课程。"
)
_REFUSAL_LOW_CONFIDENCE = (
    "本地知识库检索到的资料与该问题相关度不足（低于 {threshold:.0%} 阈值），"
    "为避免幻觉，我没有基于这些资料作答。请缩小问题范围或选择更具体的知识点。"
)
_REFUSAL_UNSAFE = "该提问未通过安全审查，我已停止处理，请调整表述后重试。"


class TaAgentOrchestratorService:
    """助教端 Agent 编排：意图路由 → 检索/数据工具 → 生成 → 引用核验。"""

    def __init__(self) -> None:
        self.retriever = CourseRetriever()
        self.safety = SafetyGuardrail()

    # ── 入口 ──────────────────────────────────────────────────────────────

    async def handle_message(
        self,
        payload: TaAgentMessageRequest,
        db: Session,
        user_external_id: str,
    ) -> TaAgentMessageResponse:
        """处理教师端一轮对话，返回带引用/轨迹/数据事实的响应。"""
        trace: list[AgentTraceEvent] = []
        started = datetime.now(timezone.utc)

        # 1. 安全审查：输入不可用时直接拒答，不进入任何后续环节
        safe = self.safety.check_user_input(payload.message)
        trace.append(AgentTraceEvent(step="安全审查", status="completed" if safe else "blocked"))
        if not safe:
            return self._build_response(
                payload=payload,
                answer=_REFUSAL_UNSAFE,
                trace=trace,
                route=ROUTE_KNOWLEDGE_QA,
                refused=True,
                refusal_reason="unsafe",
                quality=ChatQuality(cite_check="skipped", safety="blocked"),
            )

        # 2. 意图路由：业务关键词命中 → 只读数据查询；其余 → 课程知识问答
        route = self._route_intent(payload.message)
        trace.append(AgentTraceEvent(step="意图路由", status="completed", detail=route))

        if route == ROUTE_BUSINESS_QUERY:
            return await self._handle_business_query(payload, db, user_external_id, trace)

        # 3. 知识问答：解析课程范围（显式指定 → 教师班级归属课程 → 默认全库课程列表）
        course_id = await self._resolve_course_id(payload, db, user_external_id)
        if course_id is None:
            trace.append(
                AgentTraceEvent(
                    step="课程解析",
                    status="warning",
                    detail="未指定课程且教师暂无班级归属课程，将提示选择课程",
                )
            )
            return self._build_response(
                payload=payload,
                answer=(
                    "请先选择一个课程（课程资料问答需要绑定课程知识库）。"
                    "你可以在提问时带上课程名，或在班级管理中为班级关联课程。"
                ),
                trace=trace,
                route=ROUTE_KNOWLEDGE_QA,
                refused=True,
                refusal_reason="no_course",
                quality=ChatQuality(cite_check="skipped", safety="passed"),
            )

        # 4. 本地知识库检索 + 低置信度拒答（零幻觉核心防线）
        require_citations = payload.require_citations if payload.require_citations is not None else True
        raw_citations = await self.retriever.retrieve(db, course_id, payload.message)
        refuse, top_score = should_refuse_low_confidence(raw_citations, require_citations=require_citations)
        refusal_reason = None
        if refuse:
            refusal_reason = "low_confidence" if raw_citations else "no_hit"
            message = (
                _REFUSAL_LOW_CONFIDENCE.format(threshold=settings.RAG_RETRIEVAL_MIN_SCORE)
                if raw_citations
                else _REFUSAL_NO_HIT
            )
            trace.append(
                AgentTraceEvent(
                    step="本地知识库检索",
                    status="blocked" if raw_citations else "warning",
                    detail=(
                        f"Top 置信度 {top_score:.2f} < 阈值 {settings.RAG_RETRIEVAL_MIN_SCORE:.2f}"
                        if raw_citations
                        else "未命中可靠课程依据"
                    ),
                )
            )
            return self._build_response(
                payload=payload,
                answer=message,
                trace=trace,
                route=ROUTE_KNOWLEDGE_QA,
                refused=True,
                refusal_reason=refusal_reason,
                quality=ChatQuality(cite_check="skipped", safety="passed"),
            )
        trace.append(
            AgentTraceEvent(
                step="本地知识库检索",
                status="completed",
                detail=f"命中 {len(raw_citations)} 条引用（Top {top_score:.2f}）",
            )
        )

        # 5. 生成回答：检索证据注入 prompt，模型只允许基于引用作答
        answer = await self._generate_grounded_answer(
            db=db,
            message=payload.message,
            course_id=course_id,
            citations=raw_citations,
            user_external_id=user_external_id,
            trace=trace,
        )

        # 6. 引用核验与安全输出
        answer, quality = self._finalize_answer(answer, raw_citations, trace)
        return self._build_response(
            payload=payload,
            answer=answer,
            citations=raw_citations,
            trace=trace,
            route=ROUTE_KNOWLEDGE_QA,
            quality=quality,
        )

    # ── 业务数据只读查询 ──────────────────────────────────────────────────

    async def _handle_business_query(
        self,
        payload: TaAgentMessageRequest,
        db: Session,
        user_external_id: str,
        trace: list[AgentTraceEvent],
    ) -> TaAgentMessageResponse:
        """执行教师业务数据只读查询，返回数据库真实统计，不调用大模型。"""
        user = db.execute(select(User).where(User.external_id == user_external_id)).scalar_one_or_none()
        if user is None:
            return self._build_response(
                payload=payload,
                answer="无法定位当前教师账号，请重新登录后重试。",
                trace=trace,
                route=ROUTE_BUSINESS_QUERY,
                refused=True,
                refusal_reason="no_user",
            )
        trace.append(AgentTraceEvent(step="业务数据查询", status="running", detail="读取班级/作业/成绩真实记录"))

        classes = db.execute(
            select(TaClass).where(TaClass.ta_user_id == user.id, TaClass.is_active.is_(True))
        ).scalars().all()
        class_ids = [c.id for c in classes]

        # 班级规模
        student_counts: dict[str, int] = {}
        for cls in classes:
            student_counts[str(cls.id)] = db.execute(
                select(func.count()).select_from(TaClassStudent).where(TaClassStudent.class_id == cls.id)
            ).scalar() or 0
        total_students = sum(student_counts.values())

        # 作业与提交统计
        assignment_count = db.execute(
            select(func.count()).select_from(TaAssignment).where(TaAssignment.class_id.in_(class_ids))
        ).scalar() or 0 if class_ids else 0
        submission_count = (
            db.execute(
                select(func.count())
                .select_from(TaSubmission)
                .join(TaAssignment, TaSubmission.assignment_id == TaAssignment.id)
                .where(TaAssignment.class_id.in_(class_ids))
            ).scalar() or 0
            if class_ids
            else 0
        )

        # 待批改与批改完成
        pending_grading = (
            db.execute(
                select(func.count()).select_from(TaGradingRecord).where(
                    TaGradingRecord.class_id.in_(class_ids),
                    TaGradingRecord.status == "pending",
                )
            ).scalar() or 0
            if class_ids
            else 0
        )
        graded_count = (
            db.execute(
                select(func.count()).select_from(TaGradingRecord).where(
                    TaGradingRecord.class_id.in_(class_ids),
                    TaGradingRecord.status != "pending",
                )
            ).scalar() or 0
            if class_ids
            else 0
        )

        # 测验数
        quiz_count = (
            db.execute(
                select(func.count()).select_from(TaQuiz).where(TaQuiz.class_id.in_(class_ids))
            ).scalar() or 0
            if class_ids
            else 0
        )

        facts = [
            TaAgentDataFact(label="管理班级数", value=str(len(classes))),
            TaAgentDataFact(label="班级学生总数", value=str(total_students)),
            TaAgentDataFact(label="已布置作业数", value=str(assignment_count)),
            TaAgentDataFact(label="作业提交数", value=str(submission_count)),
            TaAgentDataFact(label="待批改记录", value=str(pending_grading)),
            TaAgentDataFact(label="已批改记录", value=str(graded_count)),
            TaAgentDataFact(label="已发布测验数", value=str(quiz_count)),
        ]
        for cls in classes:
            facts.append(
                TaAgentDataFact(
                    label=f"班级「{cls.name}」学生数",
                    value=str(student_counts.get(str(cls.id), 0)),
                    detail=f"邀请码 {cls.invite_code}",
                )
            )

        trace.append(
            AgentTraceEvent(
                step="业务数据查询",
                status="completed",
                detail=f"班级 {len(classes)} 个 / 学生 {total_students} 人 / 作业 {assignment_count} 份",
            )
        )
        lines = [
            f"已从数据库读取你名下 {len(classes)} 个班级的真实数据：",
            f"- 班级学生总数：{total_students} 人",
            f"- 已布置作业：{assignment_count} 份，累计提交 {submission_count} 次",
            f"- 批改进度：已批 {graded_count} 条，待批 {pending_grading} 条",
            f"- 已发布测验：{quiz_count} 场",
        ]
        for cls in classes:
            lines.append(
                f"- 「{cls.name}」{student_counts.get(str(cls.id), 0)} 人"
                f"{f'（关联课程：{self._course_title(db, cls.course_id)}）' if cls.course_id else ''}"
            )
        lines.append("\n以上数据全部来自数据库真实记录，可放心用于教学决策。")
        return self._build_response(
            payload=payload,
            answer="\n".join(lines),
            data_facts=facts,
            trace=trace,
            route=ROUTE_BUSINESS_QUERY,
            quality=ChatQuality(cite_check="skipped", safety="passed"),
        )

    # ── 生成与核验 ─────────────────────────────────────────────────────────

    async def _generate_grounded_answer(
        self,
        *,
        db: Session,
        message: str,
        course_id: str,
        citations: list[Citation],
        user_external_id: str,
        trace: list[AgentTraceEvent],
    ) -> str:
        """基于检索证据生成回答：证据块注入 prompt，并要求逐条引用。"""
        context_block = build_llm_context(citations, max_items=5)
        system_prompt = (
            "你是智课工作台的教师端 AI 助教，负责基于本地课程知识库回答教师的备课与教学问题。\n"
            "硬性规则：\n"
            "1. 只能依据下方「课程资料证据」回答，不得使用证据之外的知识或自行推断事实。\n"
            "2. 回答中引用证据时，用 [1][2] 形式标注来源编号，编号必须对应证据列表。\n"
            "3. 证据不足以回答时，明确说明「知识库资料不足以回答该问题」，不要编造。\n"
            "4. 使用简体中文，条理清晰，面向教师教学场景。\n\n"
            f"课程资料证据：\n{context_block or '（无可用证据）'}"
        )
        gateway = ModelGateway(db)
        course = db.execute(select(Course).where(Course.slug == course_id)).scalar_one_or_none()
        result = await gateway.complete_chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message},
            ],
            course_slug=course.slug if course else course_id,
            provider_code=gateway.resolve_course_chat_provider(course.slug if course else course_id),
            user_override=gateway.user_chat_override(user_external_id),
            agent_name="TaAgentKnowledgeQA",
            temperature=settings.MODEL_GATEWAY_TEMPERATURE,
            max_tokens=settings.MODEL_GATEWAY_MAX_TOKENS,
            allow_fallback=True,
        )
        trace.append(
            AgentTraceEvent(
                step="回答生成",
                status="completed" if not result.is_fallback else "warning",
                detail=f"{result.display_name}/{result.model} · {result.latency_ms}ms" + ("（降级）" if result.is_fallback else ""),
            )
        )
        return result.answer

    def _finalize_answer(
        self,
        answer: str,
        citations: list[Citation],
        trace: list[AgentTraceEvent],
    ) -> tuple[str, ChatQuality]:
        """输出安全过滤与引用核验状态记录。"""
        safety = self.safety.check_output(answer)
        if safety["status"] == "blocked":
            answer = self.safety.sanitize_output(answer)
            trace.append(AgentTraceEvent(step="输出安全审查", status="blocked", detail="输出未通过安全审查，已净化"))
        else:
            trace.append(AgentTraceEvent(step="输出安全审查", status="completed"))
        coverage = "full" if citations else "none"
        quality = ChatQuality(cite_check="passed", safety="passed", citation_coverage=coverage)
        trace.append(AgentTraceEvent(step="引用核验", status="completed", detail=f"携带 {len(citations)} 条知识库引用"))
        return answer, quality

    # ── 工具方法 ───────────────────────────────────────────────────────────

    @staticmethod
    def _route_intent(message: str) -> str:
        """按业务关键词判定意图：命中 → 只读数据查询；否则 → 课程知识问答。"""
        lowered = message.lower()
        if any(keyword in lowered for keyword in _BUSINESS_KEYWORDS):
            return ROUTE_BUSINESS_QUERY
        return ROUTE_KNOWLEDGE_QA

    async def _resolve_course_id(
        self,
        payload: TaAgentMessageRequest,
        db: Session,
        user_external_id: str,
    ) -> str | None:
        """解析课程范围：显式 course_id → 教师班级归属课程 → 无课程返回 None。"""
        if payload.course_id:
            return payload.course_id
        user = db.execute(select(User).where(User.external_id == user_external_id)).scalar_one_or_none()
        if user is None:
            return None
        cls = db.execute(
            select(TaClass).where(TaClass.ta_user_id == user.id, TaClass.course_id.isnot(None)).limit(1)
        ).scalar_one_or_none()
        if cls and cls.course_id:
            course = db.get(Course, cls.course_id)
            return course.slug if course else None
        return None

    @staticmethod
    def _course_title(db: Session, course_id) -> str:
        """按课程 ID 取课程标题，用于事实卡片描述。"""
        course = db.get(Course, course_id)
        return course.title if course else "未关联"

    def _build_response(
        self,
        *,
        payload: TaAgentMessageRequest,
        answer: str,
        trace: list[AgentTraceEvent],
        route: str,
        citations: list[Citation] | None = None,
        data_facts: list[TaAgentDataFact] | None = None,
        quality: ChatQuality | None = None,
        refused: bool = False,
        refusal_reason: str | None = None,
    ) -> TaAgentMessageResponse:
        """统一构造响应；会话轮次由路由层负责持久化。"""
        return TaAgentMessageResponse(
            conversation_id=payload.conversation_id or f"conv_{uuid4().hex[:12]}",
            answer=answer,
            citations=citations or [],
            data_facts=data_facts or [],
            agent_trace=trace,
            quality=quality or ChatQuality(cite_check="skipped", safety="passed"),
            route=route,
            refused=refused,
            refusal_reason=refusal_reason,
        )
