from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Course, CourseConcept, CourseProfile, ProfileDimension, ProfileEvidence
from app.services.model_gateway.router import ModelGateway

logger = logging.getLogger(__name__)

DIMENSION_NAMES: dict[str, str] = {
    "major_background": "专业背景",
    "knowledge_base": "知识基础",
    "cognitive_style": "认知风格",
    "learning_goal": "学习目标",
    "learning_pace": "学习节奏",
    "weakness": "易错点",
    "general_weakness": "通用能力短板",
    "resource_preference": "资源偏好",
    "expression_preference": "表达偏好",
    "learning_habit": "学习习惯",
}

GLOBAL_DIMENSION_KEYS = frozenset(
    {
        "major_background",
        "knowledge_base",
        "cognitive_style",
        "learning_goal",
        "learning_pace",
        "general_weakness",
        "resource_preference",
        "expression_preference",
        "learning_habit",
    }
)
COURSE_DIMENSION_KEYS = frozenset(
    {
        "knowledge_base",
        "cognitive_style",
        "learning_goal",
        "learning_pace",
        "weakness",
        "resource_preference",
    }
)
ALLOWED_DIMENSION_KEYS = frozenset(DIMENSION_NAMES)

TECHNICAL_ENTITY_ALIASES: dict[str, tuple[str, ...]] = {
    "LoRA": ("lora", "低秩适配", "low-rank adaptation"),
    "反向传播": ("反向传播", "backprop", "backpropagation"),
    "链式法则": ("链式法则", "链式求导", "chain rule"),
    "梯度下降": ("梯度下降", "gradient descent"),
    "矩阵维度": ("矩阵维度", "张量维度", "维度", "shape", "tensor shape"),
    "广播机制": ("广播机制", "broadcast", "broadcasting"),
    "PyTorch": ("pytorch", "torch"),
    "BatchNorm": ("batchnorm", "batch normalization", "批归一化", "批标准化"),
    "自动求导": ("自动求导", "autograd"),
    "卷积神经网络": ("卷积神经网络", "cnn", "convolutional neural network"),
    "Transformer": ("transformer", "自注意力", "self-attention", "attention"),
    "嵌入向量": ("embedding", "嵌入向量", "词向量"),
}


@dataclass(slots=True)
class MatchedCourseConcept:
    """课程概念表命中的知识点候选。"""

    code: str
    title: str
    evidence: str


@dataclass(slots=True)
class ProfileExtractionContext:
    """画像抽取前的本地候选上下文。"""

    technical_entities: list[str]
    matched_concepts: list[MatchedCourseConcept]
    scope: str


@dataclass(slots=True)
class ExtractedDimension:
    """画像维度抽取结果。"""

    dimension_key: str
    dimension_name: str
    score: int
    label: str
    evidence: str
    confidence: float
    method: str


class _LlmDimensionItem(BaseModel):
    """LLM 输出中的画像维度项。"""

    key: str
    score: int = Field(ge=0, le=100)
    label: str = Field(min_length=1, max_length=120)
    evidence: str = Field(min_length=1, max_length=500)


class _LlmTechnicalEntityItem(BaseModel):
    """LLM 确认的技术实体。"""

    name: str = Field(min_length=1, max_length=80)
    entity_type: str | None = Field(default=None, max_length=40)
    evidence: str | None = Field(default=None, max_length=200)


class _LlmMatchedConceptItem(BaseModel):
    """LLM 确认的课程概念。"""

    code: str | None = Field(default=None, max_length=120)
    title: str = Field(min_length=1, max_length=120)
    evidence: str | None = Field(default=None, max_length=200)


class _LlmProfilePayload(BaseModel):
    """LLM schema-based 画像抽取输出。"""

    dimensions: list[_LlmDimensionItem] = Field(min_length=1, max_length=8)
    technical_entities: list[_LlmTechnicalEntityItem] = Field(default_factory=list, max_length=12)
    matched_concepts: list[_LlmMatchedConceptItem] = Field(default_factory=list, max_length=8)


class ProfileExtractor:
    """基于 schema、课程概念匹配和规则兜底的学习画像抽取器。"""

    RULE_BASE_CONFIDENCE = 0.58
    LLM_BASE_CONFIDENCE = 0.72
    CONFIDENCE_PER_ROUND = 0.06
    CONFIDENCE_CAP = 0.95

    def __init__(self, db: Session) -> None:
        self.db = db

    async def extract(
        self,
        *,
        message: str,
        course_slug: str,
        answer: str | None = None,
        intent: str | None = None,
    ) -> tuple[list[ExtractedDimension], str]:
        """抽取本轮对话中的画像维度，优先走 LLM schema，失败后使用本地规则。"""
        extraction_context = self._build_extraction_context(
            message=message,
            answer=answer,
            course_slug=course_slug,
        )
        if settings.PROFILE_LLM_EXTRACTION_ENABLED:
            llm_dims = await self._extract_llm(
                message=message,
                course_slug=course_slug,
                answer=answer,
                intent=intent,
                extraction_context=extraction_context,
            )
            if llm_dims:
                return llm_dims, "llm"
        return self.extract_rule_based(message, answer=answer, extraction_context=extraction_context), "rule"

    @staticmethod
    def extract_rule_based(
        message: str,
        *,
        answer: str | None = None,
        extraction_context: ProfileExtractionContext | None = None,
    ) -> list[ExtractedDimension]:
        """使用轻量规则生成兜底画像维度。"""
        text = ProfileExtractor._normalize_text(" ".join(item for item in [message, answer or ""] if item))
        extraction_context = extraction_context or ProfileExtractionContext(
            technical_entities=ProfileExtractor._extract_technical_entities(text, []),
            matched_concepts=[],
            scope="course",
        )

        prefers_code = any(token in text for token in ["代码", "实验", "python", "pytorch", "code", "实操", "动手"])
        prefers_visual = any(token in text for token in ["图", "动画", "可视化", "流程", "思维导图"])
        prefers_quiz = any(token in text for token in ["自测", "测验", "练习题", "题目", "刷题"])
        exam_goal = any(token in text for token in ["考试", "考研", "期末", "分数", "测评"])
        project_goal = any(token in text for token in ["项目", "实践", "竞赛", "科研", "作品"])

        weakness_labels = ProfileExtractor._infer_weakness_labels(text, extraction_context)
        has_weak_signal = bool(weakness_labels)
        resource_label = ProfileExtractor._resource_label(prefers_code, prefers_visual, prefers_quiz)
        cognitive_label = ProfileExtractor._cognitive_label(prefers_code, prefers_visual, text)
        goal_label = "考试测评" if exam_goal else "项目实践" if project_goal else "待明确"
        evidence = ProfileExtractor._build_evidence_note("本地规则识别到学习偏好与薄弱信号", extraction_context)
        weakness_label = "、".join(weakness_labels[:3]) if weakness_labels else "待观察"

        raw = [
            ("knowledge_base", 55 if has_weak_signal else 72, "需补强" if has_weak_signal else "中等", evidence),
            ("cognitive_style", 82 if prefers_code or prefers_visual else 70, cognitive_label, evidence),
            ("learning_goal", 86 if exam_goal or project_goal else 65, goal_label, evidence),
            ("learning_pace", 68, "阶段推进", "默认按课程节点推进，待更多学习行为校准"),
            ("weakness", 42 if has_weak_signal else 60, weakness_label, evidence),
            ("resource_preference", 84 if prefers_code or prefers_visual or prefers_quiz else 66, resource_label, evidence),
        ]
        if extraction_context.scope == "general":
            raw = [
                ("knowledge_base", 55 if has_weak_signal else 72, "需补强" if has_weak_signal else "中等", evidence),
                ("cognitive_style", 82 if prefers_code or prefers_visual else 70, cognitive_label, evidence),
                ("learning_goal", 86 if exam_goal or project_goal else 65, goal_label, evidence),
                ("learning_pace", 68, "阶段推进", "默认按阶段推进，待更多学习行为校准"),
                ("general_weakness", 42 if has_weak_signal else 60, weakness_label, evidence),
                ("resource_preference", 84 if prefers_code or prefers_visual or prefers_quiz else 66, resource_label, evidence),
            ]

        return [
            ExtractedDimension(
                dimension_key=key,
                dimension_name=DIMENSION_NAMES[key],
                score=score,
                label=label,
                evidence=evidence_note,
                confidence=ProfileExtractor.RULE_BASE_CONFIDENCE,
                method="rule",
            )
            for key, score, label, evidence_note in raw
        ]

    async def _extract_llm(
        self,
        *,
        message: str,
        course_slug: str,
        answer: str | None,
        intent: str | None,
        extraction_context: ProfileExtractionContext,
    ) -> list[ExtractedDimension]:
        """调用模型网关进行 schema-based 画像抽取。"""
        context_bits = [f"用户消息：{message.strip()[:1200]}"]
        if answer:
            context_bits.append(f"AI 回答摘要：{answer.strip()[:800]}")
        if intent:
            context_bits.append(f"对话意图：{intent}")
        if extraction_context.technical_entities:
            context_bits.append(f"本地技术实体候选：{'、'.join(extraction_context.technical_entities[:10])}")
        if extraction_context.matched_concepts:
            concepts = "、".join(f"{item.title}({item.code})" for item in extraction_context.matched_concepts[:8])
            context_bits.append(f"课程概念表候选：{concepts}")

        allowed_keys = GLOBAL_DIMENSION_KEYS if extraction_context.scope == "general" else COURSE_DIMENSION_KEYS
        keys_hint = ", ".join(f"{key}({DIMENSION_NAMES[key]})" for key in sorted(allowed_keys))
        messages = [
            {
                "role": "system",
                "content": (
                    "你是学习画像信息抽取与校验助手。请基于本轮对话做 schema-based 信息抽取，"
                    "并用课程概念候选校验知识点归因。只输出严格 JSON，不要 Markdown。"
                    "顶层字段为 dimensions、technical_entities、matched_concepts。"
                    f"dimensions[].key 必须从以下集合选择：{keys_hint}。"
                    "每个 dimensions 项包含 key、score(0-100整数)、label(简短中文标签)、evidence(一句中文依据)。"
                    "technical_entities 用于列出 LoRA、反向传播、PyTorch、BatchNorm 等技术实体。"
                    "matched_concepts 只填写已被对话证据支持的课程概念。"
                    "禁止把单次课程薄弱点直接上升为全局短板；证据不足时用较低分和“待观察”。"
                    "至少输出 4 个画像维度，最多 6 个画像维度。"
                ),
            },
            {"role": "user", "content": "\n".join(context_bits)},
        ]
        try:
            result = await ModelGateway(self.db).complete_chat(
                messages=messages,
                course_slug=course_slug,
                agent_name="画像维度抽取 Agent",
                temperature=0.1,
                max_tokens=900,
                allow_fallback=False,
                json_mode=True,
            )
            if result.is_fallback or result.status not in {"success", "completed"}:
                return []
            return ProfileExtractor._parse_llm_payload(result.answer, extraction_context=extraction_context)
        except Exception:
            logger.warning(
                "画像 LLM 抽取失败，已切换到本地规则兜底：course_slug=%s scope=%s",
                course_slug,
                extraction_context.scope,
                exc_info=True,
            )
            return []

    @staticmethod
    def _parse_llm_payload(
        raw_text: str,
        *,
        extraction_context: ProfileExtractionContext | None = None,
    ) -> list[ExtractedDimension]:
        """解析并校验 LLM JSON 输出。"""
        raw_text = (raw_text or "").strip()
        match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if not match:
            return []
        try:
            payload = _LlmProfilePayload.model_validate(json.loads(match.group(0)))
        except (json.JSONDecodeError, ValidationError):
            return []

        payload_entities = [item.name.strip() for item in payload.technical_entities if item.name.strip()]
        payload_concepts = [item.title.strip() for item in payload.matched_concepts if item.title.strip()]
        if extraction_context:
            payload_entities.extend(extraction_context.technical_entities)
            payload_concepts.extend(item.title for item in extraction_context.matched_concepts)
        entity_names = ProfileExtractor._unique_non_empty(payload_entities, limit=10)
        concept_titles = ProfileExtractor._unique_non_empty(payload_concepts, limit=8)

        dimensions: list[ExtractedDimension] = []
        seen: set[str] = set()
        for item in payload.dimensions:
            key = item.key.strip()
            if key not in ALLOWED_DIMENSION_KEYS or key in seen:
                continue
            seen.add(key)
            dimensions.append(
                ExtractedDimension(
                    dimension_key=key,
                    dimension_name=DIMENSION_NAMES[key],
                    score=int(item.score),
                    label=item.label.strip(),
                    evidence=ProfileExtractor._merge_extraction_evidence(item.evidence.strip(), entity_names, concept_titles),
                    confidence=ProfileExtractor.LLM_BASE_CONFIDENCE,
                    method="llm",
                )
            )
        return dimensions if len(dimensions) >= 4 else []

    def _build_extraction_context(
        self,
        *,
        message: str,
        answer: str | None,
        course_slug: str,
    ) -> ProfileExtractionContext:
        """构建技术实体和课程概念候选上下文。"""
        text = ProfileExtractor._normalize_text(" ".join(item for item in [message, answer or ""] if item))
        scope = "general" if not course_slug or course_slug == "general" else "course"
        matched_concepts = self._match_course_concepts(course_slug, text) if scope == "course" else []
        technical_entities = ProfileExtractor._extract_technical_entities(text, matched_concepts)
        return ProfileExtractionContext(
            technical_entities=technical_entities,
            matched_concepts=matched_concepts,
            scope=scope,
        )

    def _match_course_concepts(self, course_slug: str, normalized_text: str) -> list[MatchedCourseConcept]:
        """根据课程概念表匹配本轮对话涉及的知识点。"""
        try:
            course = self.db.execute(select(Course).where(Course.slug == course_slug)).scalar_one_or_none()
            if not course:
                return []
            concepts = (
                self.db.execute(
                    select(CourseConcept)
                    .where(CourseConcept.course_id == course.id, CourseConcept.status == "published")
                    .order_by(CourseConcept.recommended_order, CourseConcept.title)
                    .limit(160)
                )
                .scalars()
                .all()
            )
        except Exception:
            logger.warning(
                "课程概念表匹配失败，已跳过概念对齐：course_slug=%s",
                course_slug,
                exc_info=True,
            )
            return []

        matches: list[MatchedCourseConcept] = []
        seen_codes: set[str] = set()
        for concept in concepts:
            for alias in self._concept_aliases(concept):
                if not self._contains_alias(normalized_text, alias):
                    continue
                code = concept.code or str(concept.id)
                if code in seen_codes:
                    break
                seen_codes.add(code)
                matches.append(MatchedCourseConcept(code=code, title=concept.title, evidence=f"命中概念别名：{alias}"))
                break
            if len(matches) >= 8:
                break
        return matches

    @staticmethod
    def _concept_aliases(concept: CourseConcept) -> list[str]:
        """从课程概念字段和 meta_json 中收集可匹配别名。"""
        aliases: list[str] = [concept.title, concept.code]
        meta = concept.meta_json or {}
        for key in ("alias", "aliases", "keywords", "tags", "names"):
            raw_value = meta.get(key)
            if isinstance(raw_value, str):
                aliases.extend(part.strip() for part in re.split(r"[,，、;；\s]+", raw_value) if part.strip())
            elif isinstance(raw_value, list):
                aliases.extend(str(item).strip() for item in raw_value if str(item).strip())
        return ProfileExtractor._unique_non_empty(aliases, limit=12)

    @staticmethod
    def _extract_technical_entities(normalized_text: str, matched_concepts: list[MatchedCourseConcept]) -> list[str]:
        """抽取技术实体候选，供画像证据和 LLM 校验使用。"""
        entities: list[str] = []
        for canonical_name, aliases in TECHNICAL_ENTITY_ALIASES.items():
            if any(ProfileExtractor._contains_alias(normalized_text, alias) for alias in aliases):
                entities.append(canonical_name)
        entities.extend(concept.title for concept in matched_concepts)
        return ProfileExtractor._unique_non_empty(entities, limit=12)

    @staticmethod
    def _infer_weakness_labels(text: str, extraction_context: ProfileExtractionContext) -> list[str]:
        """从本地信号推断薄弱标签。"""
        labels: list[str] = []
        if any(token in text for token in ["不会", "不懂", "搞不清", "公式", "推导", "链式", "梯度", "反向传播"]):
            labels.append("公式推导")
        if any(token in text for token in ["矩阵维度", "张量维度", "维度", "shape", "广播"]):
            labels.append("矩阵维度")
        if any(token in text for token in ["报错", "bug", "运行不了", "代码不会", "debug"]):
            labels.append("代码实践")
        if any(token in text for token in ["概念", "理解", "原理"]):
            labels.append("概念理解")
        for concept in extraction_context.matched_concepts:
            if concept.title not in labels:
                labels.append(concept.title)
        return ProfileExtractor._unique_non_empty(labels, limit=5)

    @staticmethod
    def _resource_label(prefers_code: bool, prefers_visual: bool, prefers_quiz: bool) -> str:
        """根据显式偏好生成资源标签。"""
        labels: list[str] = []
        if prefers_code:
            labels.append("代码实验")
        if prefers_visual:
            labels.append("图解动画")
        if prefers_quiz:
            labels.append("自测题")
        return "、".join(labels[:2]) if labels else "讲义"

    @staticmethod
    def _cognitive_label(prefers_code: bool, prefers_visual: bool, text: str) -> str:
        """根据提问方式生成认知风格标签。"""
        if prefers_code:
            return "代码实践型"
        if prefers_visual:
            return "图解型"
        if any(token in text for token in ["公式", "推导", "证明"]):
            return "结构化推导型"
        return "结构化讲解"

    @staticmethod
    def _build_evidence_note(base: str, extraction_context: ProfileExtractionContext) -> str:
        """把本地候选压缩成可写入证据表的说明。"""
        parts = [base]
        if extraction_context.matched_concepts:
            parts.append("课程概念：" + "、".join(item.title for item in extraction_context.matched_concepts[:4]))
        if extraction_context.technical_entities:
            parts.append("技术实体：" + "、".join(extraction_context.technical_entities[:6]))
        return "；".join(parts)[:500]

    @staticmethod
    def _merge_extraction_evidence(base: str, entities: list[str], concepts: list[str]) -> str:
        """合并 LLM 依据与本地技术实体、课程概念候选。"""
        parts = [base]
        if concepts:
            parts.append("课程概念：" + "、".join(concepts[:4]))
        if entities:
            parts.append("技术实体：" + "、".join(entities[:6]))
        return "；".join(ProfileExtractor._unique_non_empty(parts, limit=3))[:500]

    @staticmethod
    def _contains_alias(normalized_text: str, alias: str) -> bool:
        """判断文本是否包含别名，英文别名按词边界匹配。"""
        candidate = ProfileExtractor._normalize_text(alias)
        if not candidate:
            return False
        if re.fullmatch(r"[a-z0-9_+\-. ]+", candidate):
            return bool(re.search(rf"(?<![a-z0-9_]){re.escape(candidate)}(?![a-z0-9_])", normalized_text))
        return candidate in normalized_text

    @staticmethod
    def _normalize_text(text: str) -> str:
        """统一文本大小写和空白，便于中英文混合匹配。"""
        return re.sub(r"\s+", " ", (text or "").strip().lower())

    @staticmethod
    def _unique_non_empty(values: list[str], *, limit: int) -> list[str]:
        """去重并过滤空值，保留原始顺序。"""
        result: list[str] = []
        seen: set[str] = set()
        for value in values:
            item = str(value).strip()
            key = item.lower()
            if not item or key in seen:
                continue
            seen.add(key)
            result.append(item)
            if len(result) >= limit:
                break
        return result

    def apply_to_profile(
        self,
        profile: CourseProfile,
        dimensions: list[ExtractedDimension],
        *,
        source_type: str,
        source_id: str | None,
    ) -> None:
        """兼容旧调用：把抽取结果应用到课程画像。"""
        existing = {
            item.dimension_key: item
            for item in self.db.query(ProfileDimension).filter(ProfileDimension.profile_id == profile.id).all()
        }
        profile.summary = self.build_summary(dimensions)
        dim_confidences: list[float] = []

        for dim in dimensions:
            prior_evidence_len = 0
            item = existing.get(dim.dimension_key)
            prior_score = item.score if item else None
            if item:
                prior_evidence_len = len(item.evidence_json or [])
                item.score = round(item.score * 0.7 + dim.score * 0.3)
                item.label = dim.label
                item.confidence = self._bumped_confidence(item.confidence, prior_evidence_len, dim.method)
                evidence_entry = {
                    "source": source_type,
                    "method": dim.method,
                    "note": dim.evidence,
                }
                item.evidence_json = (item.evidence_json or [])[-4:] + [evidence_entry]
            else:
                item = ProfileDimension(
                    profile_id=profile.id,
                    user_profile_id=None,
                    profile_scope="course",
                    dimension_key=dim.dimension_key,
                    dimension_name=dim.dimension_name,
                    score=dim.score,
                    label=dim.label,
                    confidence=self._bumped_confidence(None, 0, dim.method),
                    evidence_json=[{"source": source_type, "method": dim.method, "note": dim.evidence}],
                    status="active",
                )
                self.db.add(item)
                existing[dim.dimension_key] = item

            dim_confidences.append(item.confidence)
            delta = (item.score - prior_score) if prior_score is not None else 0
            self.db.add(
                ProfileEvidence(
                    profile_id=profile.id,
                    user_profile_id=None,
                    user_id=profile.user_id,
                    course_id=profile.course_id,
                    scope="course",
                    dimension_key=dim.dimension_key,
                    label=dim.label,
                    source_type=source_type,
                    source_id=source_id,
                    delta=delta,
                    confidence_delta=dim.confidence,
                    note=dim.evidence,
                    summary=dim.evidence,
                    confidence=item.confidence,
                    status="active",
                )
            )

        if dim_confidences:
            profile.confidence = min(
                self.CONFIDENCE_CAP,
                max(profile.confidence or 0, sum(dim_confidences) / len(dim_confidences)),
            )

    @classmethod
    def _bumped_confidence(cls, existing: float | None, prior_evidence_len: int, method: str) -> float:
        """根据证据轮次提升置信度。"""
        base = cls.LLM_BASE_CONFIDENCE if method == "llm" else cls.RULE_BASE_CONFIDENCE
        rounds = prior_evidence_len + 1
        bumped = max(existing or 0, base) + cls.CONFIDENCE_PER_ROUND * min(rounds, 5)
        return min(cls.CONFIDENCE_CAP, bumped)

    @staticmethod
    def build_summary(dimensions: list[ExtractedDimension]) -> str:
        """生成画像摘要。"""
        labels = {dim.dimension_name: dim.label for dim in dimensions}
        parts = [
            f"知识基础：{labels.get('知识基础', '待观察')}",
            f"认知风格：{labels.get('认知风格', '待观察')}",
            f"目标：{labels.get('学习目标', '待明确')}",
            f"资源偏好：{labels.get('资源偏好', '讲义')}",
        ]
        weakness = labels.get("易错点") or labels.get("通用能力短板")
        if weakness:
            parts.append(f"薄弱点：{weakness}")
        return "；".join(parts) + "。"

    @staticmethod
    def format_dimensions_for_prompt(
        profile: CourseProfile | None,
        dimensions: list[ProfileDimension],
    ) -> str:
        """把画像维度格式化为可注入 prompt 的中文文本。"""
        if not profile and not dimensions:
            return "暂无画像摘要，使用课程默认学习者画像。"
        lines: list[str] = []
        if profile and profile.summary:
            lines.append(profile.summary.strip())
        if dimensions:
            lines.append("维度明细：")
            for item in sorted(dimensions, key=lambda row: row.dimension_key):
                conf = f"{(item.confidence or 0) * 100:.0f}%"
                lines.append(f"- {item.dimension_name}：{item.label or '—'}（{item.score} 分，置信 {conf}）")
                latest = (item.evidence_json or [])[-1:] if item.evidence_json else []
                if latest and latest[0].get("note"):
                    lines.append(f"  依据：{latest[0]['note']}")
        return "\n".join(lines) if lines else "暂无画像摘要，使用课程默认学习者画像。"
