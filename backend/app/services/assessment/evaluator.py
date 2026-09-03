from __future__ import annotations

import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Assessment, AssessmentItem, ConceptMastery, Course, CourseConcept, User
from app.schemas.assessment import AssessmentResult, AssessmentSubmitRequest
from app.services.learning.events import LearningEventRecorder
from app.services.learning.repository import LearningRepository
from app.services.profile.repository import LearningProfileRepository

logger = logging.getLogger(__name__)

_ASSESSMENT_LLM_SEMAPHORE = asyncio.Semaphore(max(1, settings.ASSESSMENT_LLM_CONCURRENCY))


class AssessmentEvaluator:
    """评估学习练习答案，并将结果写入掌握度、画像和学习事件。"""

    def _course(self, db: Session, slug: str) -> Course | None:
        """按课程 slug 查询课程实体。"""
        return db.execute(select(Course).where(Course.slug == slug)).scalar_one_or_none()

    def _concept(self, db: Session, course: Course, code: str) -> CourseConcept | None:
        """在指定课程内按知识点编码查询知识点实体。"""
        return db.execute(select(CourseConcept).where(CourseConcept.course_id == course.id, CourseConcept.code == code)).scalar_one_or_none()

    def _user(self, db: Session, external_id: str) -> User | None:
        """按外部用户标识查询用户实体。"""
        return db.execute(select(User).where(User.external_id == external_id)).scalar_one_or_none()

    async def evaluate(self, payload: AssessmentSubmitRequest, db: Session, user_external_id: str = "user_zhang") -> AssessmentResult:
        """评估一次测评提交并写入学习闭环证据。

        参数:
            payload: 前端提交的测评答案、课程和知识点信息。
            db: 当前请求使用的数据库会话。
            user_external_id: 用户外部标识，默认使用演示学生账号。

        返回:
            包含得分、掌握度变化、反馈、Rubric 和进度报告的测评结果。
        """
        course = self._course(db, payload.course_id)
        if not course:
            return AssessmentResult(
                id="assessment_not_created",
                score=0,
                mastery_delta=0,
                feedback="课程不存在，无法写入评估结果。",
                weak_reasons=["课程上下文缺失"],
                recommended_actions=["请先选择有效课程"],
            )
        concept = self._concept(db, course, payload.concept_id)
        user = self._user(db, user_external_id)
        structured_submission = self._parse_stage_assessment_submission(payload.answer)
        score, rubric, scoring_method = await self._score_with_rubric(payload, db, course.slug, concept.title if concept else "当前知识点")
        feedback, weak_reasons, recommended_actions = self._feedback(score, concept.title if concept else "当前知识点")
        progress_report = self._progress_report(score, concept.title if concept else "当前知识点", weak_reasons)
        old_mastery = 0
        assessment = Assessment(
            course_id=course.id,
            concept_id=concept.id if concept else None,
            user_id=user.id if user else None,
            assessment_type=payload.assessment_type,
            score=score,
            mastery_delta=0,
            feedback=feedback,
            weak_reasons_json=weak_reasons,
            recommended_actions_json=recommended_actions,
            rubric_json={"items": rubric},
            scoring_method=scoring_method,
            answer_snapshot=payload.answer,
        )
        db.add(assessment)
        db.flush()
        if structured_submission:
            self._record_stage_assessment_items(db, assessment, structured_submission, rubric)
        if course and concept and user:
            mastery = db.execute(
                select(ConceptMastery).where(
                    ConceptMastery.course_id == course.id,
                    ConceptMastery.concept_id == concept.id,
                    ConceptMastery.user_id == user.id,
                )
            ).scalar_one_or_none()
            if not mastery:
                mastery = ConceptMastery(
                    course_id=course.id,
                    concept_id=concept.id,
                    user_id=user.id,
                    mastery=0,
                    status="not_started",
                    evidence_json=[],
                )
                db.add(mastery)
                db.flush()
            old_mastery = mastery.mastery
            new_mastery = max(0, min(100, round(old_mastery * 0.65 + score * 0.35)))
            mastery.mastery = new_mastery
            mastery.status = "mastered" if new_mastery >= 80 else "needs_remedial" if score < 50 or new_mastery < 50 else "learning"
            event_time = datetime.now(timezone.utc).isoformat()
            mastery.evidence_json = (mastery.evidence_json or []) + [{"source": "assessment", "score": score, "old_mastery": old_mastery, "new_mastery": new_mastery, "created_at": event_time}]
            assessment.mastery_delta = new_mastery - old_mastery
            LearningProfileRepository(db).record_assessment_evidence(
                user=user,
                course=course,
                concept_title=concept.title if concept else payload.concept_id,
                assessment_id=str(assessment.id),
                score=score,
                mastery_delta=assessment.mastery_delta,
                weak_reasons=weak_reasons,
            )
            LearningEventRecorder(db).record(
                course_id=course.id,
                user_id=user.id,
                concept_id=concept.id,
                event_type="assessment_completed",
                source_type="assessment",
                source_id=str(assessment.id),
                evidence={
                    "score": score,
                    "old_mastery": old_mastery,
                    "new_mastery": new_mastery,
                    "mastery_delta": assessment.mastery_delta,
                    "created_at": event_time,
                    "mastery_status": mastery.status,
                    "rubric": rubric,
                    "scoring_method": scoring_method,
                    "weak_reasons": weak_reasons,
                    "recommended_actions": recommended_actions,
                    "progress_report": progress_report,
                    "path_effect": "regenerate_with_remediation" if mastery.status == "needs_remedial" else "regenerate_next_step",
                },
            )
        db.commit()
        db.refresh(assessment)
        if course and user:
            LearningRepository(db).generate_path(course.slug, user.external_id)
        return AssessmentResult(
            id=str(assessment.id),
            score=score,
            mastery_delta=assessment.mastery_delta,
            feedback=feedback,
            weak_reasons=weak_reasons,
            recommended_actions=recommended_actions,
            rubric=rubric,
            scoring_method=scoring_method,
            progress_report=progress_report,
        )

    async def _score_with_rubric(
        self,
        payload: AssessmentSubmitRequest,
        db: Session,
        course_slug: str,
        concept_title: str,
    ) -> tuple[int, list[dict[str, Any]], str]:
        """优先使用 LLM Rubric 评估，失败时使用本地结构化 Rubric。"""
        structured_submission = self._parse_stage_assessment_submission(payload.answer)
        if structured_submission:
            score, rubric, used_llm = await self._score_stage_assessment_submission(
                structured_submission,
                db=db,
                course_slug=course_slug,
                concept_title=concept_title,
            )
            return score, rubric, "stage_assessment_ai_rubric" if used_llm else "stage_assessment_rubric"
        fallback = self._heuristic_rubric(payload.answer, payload.assessment_type)
        if not settings.ASSESSMENT_LLM_RUBRIC_ENABLED:
            return self._score_from_rubric(fallback), fallback, "heuristic_rubric"
        try:
            from app.services.model_gateway.router import ModelGateway

            result = await ModelGateway(db).complete_chat(
                [
                    {
                        "role": "system",
                        "content": (
                            "你是课程练习 Rubric 评分器。只输出 JSON，字段为 items。"
                            "items 是数组，每项包含 key、label、score、weight、evidence、feedback。"
                            "score 范围 0-100，weight 总和约 1。不要输出 Markdown。"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"知识点：{concept_title}\n"
                            f"测评类型：{payload.assessment_type}\n"
                            f"学生答案：\n{payload.answer[:4000]}"
                        ),
                    },
                ],
                course_slug=course_slug,
                agent_name="AssessmentRubricAgent",
                temperature=0.1,
                max_tokens=900,
                json_mode=True,
            )
            rubric = self._parse_llm_rubric(result.answer)
            if rubric:
                return self._score_from_rubric(rubric), rubric, "llm_rubric"
        except Exception:
            logger.warning(
                "LLM Rubric 评分失败，将退回本地结构化 Rubric：course_slug=%s concept_title=%s assessment_type=%s",
                course_slug,
                concept_title,
                payload.assessment_type,
                exc_info=True,
            )
            return self._score_from_rubric(fallback), fallback, "heuristic_rubric"
        return self._score_from_rubric(fallback), fallback, "heuristic_rubric"

    def _parse_stage_assessment_submission(self, answer: str) -> dict[str, Any] | None:
        """解析前端可作答阶段测评提交，无法识别时保持旧评估流程。"""
        try:
            data = json.loads(answer)
        except json.JSONDecodeError:
            return None
        if not isinstance(data, dict) or data.get("kind") != "stage_assessment_submission":
            return None
        questions = data.get("questions")
        if not isinstance(questions, list) or not questions:
            return None
        valid_questions = [item for item in questions if isinstance(item, dict) and item.get("prompt")]
        if not valid_questions:
            return None
        return {**data, "questions": valid_questions[:12]}

    async def _score_stage_assessment_submission(
        self,
        submission: dict[str, Any],
        *,
        db: Session,
        course_slug: str,
        concept_title: str,
    ) -> tuple[int, list[dict[str, Any]], bool]:
        """按题目标准答案和 AI 主观题 Rubric 生成阶段测评分项评分。"""

        questions = submission.get("questions")
        if not isinstance(questions, list):
            return 0, [], False
        total_points = sum(self._question_points(question) for question in questions) or 1
        rubric: list[dict[str, Any]] = []
        used_llm = False
        for index, question in enumerate(questions):
            points = self._question_points(question)
            if self._should_score_question_with_llm(question):
                item_score, feedback, evidence, llm_ok = await self._score_subjective_question_with_llm(
                    question,
                    db=db,
                    course_slug=course_slug,
                    concept_title=concept_title,
                )
                used_llm = used_llm or llm_ok
            else:
                item_score, feedback, evidence = self._score_stage_question(question)
            rubric.append(
                {
                    "key": str(question.get("id") or f"question_{index + 1}"),
                    "label": f"第 {index + 1} 题 · {self._question_type_label(question)}",
                    "score": item_score,
                    "weight": points / total_points,
                    "evidence": evidence,
                    "feedback": feedback,
                    "max_score": points,
                }
            )
        return self._score_from_rubric(rubric), rubric, used_llm

    @staticmethod
    def _should_score_question_with_llm(question: dict[str, Any]) -> bool:
        """判断单题是否需要模型进行主观评分。"""

        question_type = str(question.get("type") or "")
        return question_type in {"short_answer", "practice"} and bool(str(question.get("student_answer") or "").strip())

    async def _score_subjective_question_with_llm(
        self,
        question: dict[str, Any],
        *,
        db: Session,
        course_slug: str,
        concept_title: str,
    ) -> tuple[int, str, str, bool]:
        """调用模型同步评估主观题，失败时退回本地关键词评分。"""

        if not settings.ASSESSMENT_LLM_RUBRIC_ENABLED:
            item_score, feedback, evidence = self._score_stage_question(question)
            return item_score, feedback, evidence, False
        try:
            async with _ASSESSMENT_LLM_SEMAPHORE:
                from app.services.model_gateway.router import ModelGateway

                result = await ModelGateway(db).complete_chat(
                    [
                        {
                            "role": "system",
                            "content": (
                                "你是阶段测评主观题评分器。只输出 JSON，不要输出 Markdown。"
                                "JSON 字段：score(0-100整数)、feedback(面向学生的中文反馈)、evidence(命中与缺失评分点)。"
                            ),
                        },
                        {
                            "role": "user",
                            "content": json.dumps(
                                {
                                    "concept_title": concept_title,
                                    "question_type": question.get("type"),
                                    "prompt": question.get("prompt"),
                                    "student_answer": question.get("student_answer"),
                                    "expected_answer": question.get("expected_answer"),
                                    "scoring_points": question.get("scoring_points") or [],
                                    "keywords": question.get("keywords") or [],
                                    "max_score": self._question_points(question),
                                    "rules": [
                                        "必须依据学生答案评分，不能替学生补全未写内容。",
                                        "优先看 scoring_points，其次看 expected_answer 和 keywords。",
                                        "反馈指出已覆盖内容和最重要的缺失点。",
                                    ],
                                },
                                ensure_ascii=False,
                            ),
                        },
                    ],
                    course_slug=course_slug,
                    agent_name="AssessmentSubjectiveScorer",
                    temperature=0.05,
                    max_tokens=600,
                    json_mode=True,
                )
            parsed = self._parse_subjective_score(result.answer)
            if parsed:
                return parsed["score"], parsed["feedback"], parsed["evidence"], True
        except Exception:
            logger.warning(
                "主观题 AI 评分失败，将退回关键词评分：course_slug=%s concept_title=%s prompt=%s",
                course_slug,
                concept_title,
                str(question.get("prompt") or "")[:80],
                exc_info=True,
            )
        item_score, feedback, evidence = self._score_stage_question(question)
        return item_score, feedback, evidence, False

    def _parse_subjective_score(self, answer: str) -> dict[str, Any] | None:
        """解析主观题模型评分 JSON。"""

        text = (answer or "").strip()
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None
        if not isinstance(data, dict):
            return None
        score = self._clamp_score(data.get("score"))
        feedback = str(data.get("feedback") or "已完成 AI 主观题评分。").strip()
        evidence = str(data.get("evidence") or "模型依据参考答案和评分要点评估。").strip()
        return {"score": score, "feedback": feedback[:500], "evidence": evidence[:500]}

    def _record_stage_assessment_items(
        self,
        db: Session,
        assessment: Assessment,
        submission: dict[str, Any],
        rubric: list[dict[str, Any]],
    ) -> None:
        """保存题目级作答快照，方便后续错题回看和人工追踪。"""
        rubric_by_key = {str(item.get("key")): item for item in rubric}
        for index, question in enumerate(submission.get("questions") or []):
            if not isinstance(question, dict):
                continue
            question_id = str(question.get("id") or f"question_{index + 1}")
            item_rubric = rubric_by_key.get(question_id, {})
            max_score = self._question_points(question)
            item_score = round(int(item_rubric.get("score") or 0) * max_score / 100)
            db.add(
                AssessmentItem(
                    assessment_id=assessment.id,
                    item_type=str(question.get("type") or "stage_question"),
                    prompt=str(question.get("prompt") or ""),
                    expected_answer=self._stringify_expected_answer(question.get("expected_answer")),
                    score=item_score,
                    meta_json={
                        "student_answer": question.get("student_answer"),
                        "max_score": max_score,
                        "scoring_points": question.get("scoring_points"),
                        "keywords": question.get("keywords"),
                        "rubric": item_rubric,
                    },
                )
            )

    def _score_stage_question(self, question: dict[str, Any]) -> tuple[int, str, str]:
        """对单题进行轻量评分，客观题严格匹配，主观题按关键词覆盖度评分。"""
        question_type = str(question.get("type") or "")
        student_answer = self._normalize_answer(question.get("student_answer"))
        expected_answer = self._normalize_answer(question.get("expected_answer"))
        if not student_answer:
            return 0, "未作答，本题不得分。", "学生未填写答案。"
        if question_type in {"single_choice", "true_false"}:
            is_correct = student_answer == expected_answer
            return (
                100 if is_correct else 0,
                "答案正确。" if is_correct else "答案与标准答案不一致，建议回看题目解析。",
                f"学生答案：{student_answer or '未作答'}；标准答案：{expected_answer or '未配置'}。",
            )
        if question_type == "multiple_choice":
            expected_set = set(self._split_answer_tokens(expected_answer))
            student_set = set(self._split_answer_tokens(student_answer))
            if not expected_set:
                return 0, "本题缺少标准答案，暂无法评分。", "标准答案未配置。"
            matched = len(expected_set & student_set)
            has_extra = bool(student_set - expected_set)
            item_score = round(matched / len(expected_set) * (80 if has_extra else 100))
            return (
                item_score,
                "多选答案基本匹配。" if item_score >= 80 else "多选答案仍有遗漏或误选。",
                f"命中 {matched}/{len(expected_set)} 个正确选项。",
            )
        keywords = self._question_keywords(question)
        matched_keywords = [keyword for keyword in keywords if keyword in student_answer]
        if keywords:
            keyword_score = len(matched_keywords) / len(keywords) * 72
            length_score = min(28, len(student_answer) / 36 * 28)
            item_score = round(keyword_score + length_score)
            return (
                max(0, min(100, item_score)),
                "已覆盖主要评分点。" if item_score >= 80 else "答案可用，但关键评分点覆盖还不完整。" if item_score >= 55 else "答案缺少关键评分点。",
                f"命中关键词：{'、'.join(matched_keywords) if matched_keywords else '暂无'}。",
            )
        is_match = expected_answer and expected_answer in student_answer
        return (
            100 if is_match else self._dimension_score(student_answer, ["定义", "输入", "输出", "例子", "步骤"], 48),
            "答案命中参考表述。" if is_match else "已按答案完整度进行估分，建议补充标准答案中的关键表述。",
            "未配置关键词，使用答案完整度估分。",
        )

    @staticmethod
    def _question_points(question: dict[str, Any]) -> int:
        """读取单题分值，异常值按 1 分处理。"""
        try:
            points = int(question.get("max_score") or question.get("points") or 1)
        except (TypeError, ValueError):
            points = 1
        return max(1, points)

    @staticmethod
    def _question_type_label(question: dict[str, Any]) -> str:
        """把题型编码转换成学生可读标签。"""
        labels = {
            "single_choice": "单选题",
            "multiple_choice": "多选题",
            "true_false": "判断题",
            "blank": "填空题",
            "short_answer": "简答题",
        }
        return labels.get(str(question.get("type") or ""), "测评题")

    @staticmethod
    def _normalize_answer(value: object) -> str:
        """归一化学生答案和标准答案，减少大小写与空白差异。"""
        if isinstance(value, list):
            value = ",".join(str(item) for item in value)
        return str(value or "").strip().replace("，", ",").upper()

    @staticmethod
    def _split_answer_tokens(value: str) -> list[str]:
        """拆分多选题答案选项。"""
        return [item.strip() for item in value.replace("、", ",").split(",") if item.strip()]

    @staticmethod
    def _stringify_expected_answer(value: object) -> str:
        """把标准答案快照转换成便于入库的文本。"""
        if isinstance(value, list):
            return "、".join(str(item) for item in value)
        return str(value or "")

    def _question_keywords(self, question: dict[str, Any]) -> list[str]:
        """读取题目关键词，用于填空题和简答题的轻量评分。"""
        raw_keywords = question.get("keywords")
        if isinstance(raw_keywords, list):
            keywords = [self._normalize_answer(item) for item in raw_keywords if str(item).strip()]
        else:
            keywords = []
        if keywords:
            return keywords[:12]
        scoring_points = question.get("scoring_points")
        if not isinstance(scoring_points, list):
            return []
        return [self._normalize_answer(item) for item in scoring_points if str(item).strip()][:12]

    def _parse_llm_rubric(self, answer: str) -> list[dict[str, Any]]:
        """解析并校验 LLM Rubric JSON。"""
        try:
            data = json.loads(answer)
        except json.JSONDecodeError:
            return []
        raw_items = data.get("items") if isinstance(data, dict) else None
        if not isinstance(raw_items, list):
            return []
        parsed: list[dict[str, Any]] = []
        for index, item in enumerate(raw_items[:6]):
            if not isinstance(item, dict):
                continue
            score = self._clamp_score(item.get("score"))
            weight = float(item.get("weight") or 0.0)
            parsed.append(
                {
                    "key": str(item.get("key") or f"dimension_{index + 1}"),
                    "label": str(item.get("label") or "评分维度"),
                    "score": score,
                    "weight": max(0.0, min(1.0, weight)),
                    "evidence": str(item.get("evidence") or "未提供证据"),
                    "feedback": str(item.get("feedback") or "建议补充更明确的推理和证据。"),
                }
            )
        return parsed

    def _heuristic_rubric(self, answer: str, assessment_type: str) -> list[dict[str, Any]]:
        """在模型不可用时生成稳定的结构化 Rubric。"""
        text = answer.strip().lower()
        length_score = min(100, 42 + len(text) // 8)
        concept_score = self._dimension_score(text, ["定义", "概念", "公式", "输入", "输出", "原因"], length_score)
        reasoning_score = self._dimension_score(text, ["因为", "所以", "步骤", "推导", "链式", "梯度"], length_score - 6)
        evidence_score = self._dimension_score(text, ["例子", "代码", "实验", "数据", "对比", "验证"], length_score - 10)
        transfer_score = self._dimension_score(text, ["应用", "迁移", "边界", "复杂度", "项目", "实践"], length_score - 14)
        if assessment_type == "code_lab":
            evidence_score = max(evidence_score, self._dimension_score(text, ["import", "def ", "torch", "tensor", "shape"], length_score))
        return [
            self._rubric_item("concept_accuracy", "概念准确性", concept_score, 0.35, "是否覆盖定义、输入输出和关键术语"),
            self._rubric_item("reasoning_integrity", "推理完整性", reasoning_score, 0.30, "是否说明步骤、因果关系和中间过程"),
            self._rubric_item("evidence_examples", "证据与例子", evidence_score, 0.20, "是否提供例子、代码或可验证证据"),
            self._rubric_item("transfer_practice", "迁移应用", transfer_score, 0.15, "是否能迁移到实践、项目或边界场景"),
        ]

    @staticmethod
    def _rubric_item(key: str, label: str, score: int, weight: float, evidence: str) -> dict[str, Any]:
        """构造单个 Rubric 分项。"""
        feedback = "表现较稳，可以进入下一步。" if score >= 80 else "基本成立，但还需要补充细节。" if score >= 60 else "证据不足，建议先做补救练习。"
        return {"key": key, "label": label, "score": score, "weight": weight, "evidence": evidence, "feedback": feedback}

    @staticmethod
    def _dimension_score(text: str, markers: list[str], base_score: int) -> int:
        """根据答案特征生成单项分数。"""
        if not text:
            return 20
        marker_bonus = sum(1 for marker in markers if marker in text) * 9
        negative_markers = ["不会", "不知道", "不清楚", "随便", "wrong", "idk"]
        penalty = 28 if any(marker in text for marker in negative_markers) else 0
        return max(18, min(96, base_score + marker_bonus - penalty))

    @staticmethod
    def _score_from_rubric(rubric: list[dict[str, Any]]) -> int:
        """按权重计算总分。"""
        total_weight = sum(float(item.get("weight") or 0) for item in rubric) or 1.0
        weighted = sum(int(item.get("score") or 0) * float(item.get("weight") or 0) for item in rubric)
        return max(0, min(100, round(weighted / total_weight)))

    @staticmethod
    def _clamp_score(value: object) -> int:
        """把未知输入收敛到 0-100 分。"""
        try:
            score = int(float(value))
        except (TypeError, ValueError):
            score = 0
        return max(0, min(100, score))

    @staticmethod
    def _score_answer(answer: str) -> int:
        """根据答案长度和关键表达估算兼容旧流程的启发式分数。"""
        text = answer.strip().lower()
        if not text:
            return 20
        negative_markers = ["不会", "不知道", "错", "随便", "不清楚", "不会做", "wrong", "idk"]
        strong_markers = ["因为", "所以", "步骤", "公式", "代码", "例子", "链式", "梯度", "输入", "输出"]
        if any(marker in text for marker in negative_markers):
            return 36
        score = 58 + min(24, len(text) // 12)
        score += min(14, sum(1 for marker in strong_markers if marker in text) * 3)
        return max(0, min(96, score))

    @staticmethod
    def _progress_report(score: int, concept_title: str, weak_reasons: list[str]) -> str:
        """生成自然语言学习进度报告。"""
        if score >= 80:
            return f"你在「{concept_title}」上的回答已经达到继续推进标准，建议把本节点标为完成并进入下一路径节点。"
        if score >= 60:
            return f"你在「{concept_title}」上的主线理解基本可用，但{weak_reasons[0] if weak_reasons else '细节表达'}仍需补强，建议先做一次中等难度练习。"
        return f"你在「{concept_title}」上还需要补救，建议先生成基础讲义和自测题，再重新提交一次费曼阐述。"

    @staticmethod
    def _feedback(score: int, concept_title: str) -> tuple[str, list[str], list[str]]:
        """根据得分生成反馈文案、薄弱原因和后续学习动作。"""
        if score < 50:
            return (
                f"对「{concept_title}」的解释缺少关键步骤，建议先完成补救节点再继续后续知识。",
                ["核心定义不完整", "前置概念连接不足", "缺少可验证的推理过程"],
                ["完成系统插入的补救训练", "生成一份基础讲义", "完成 5 道针对性自测题"],
            )
        if score < 80:
            return (
                f"对「{concept_title}」的理解基本成立，但细节和迁移应用还需要加强。",
                ["公式或步骤表达不够严谨", "例子不足"],
                ["复习推荐资源", "用费曼法重新解释一次", "完成一组中等难度练习"],
            )
        return (
            f"对「{concept_title}」的解释较完整，可继续推进后续节点。",
            ["后续仍需在实践中验证"],
            ["进入下一路径节点", "完成一次代码实验巩固"],
        )
