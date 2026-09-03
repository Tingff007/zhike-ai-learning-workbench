from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


IntentType = Literal[
    "start_learning_session",
    "learning_plan_request",
    "learning_progress_query",
    "course_rag_qa",
    "resource_generation",
    "default_chat",
    "general_chat",
]
IntentSource = Literal["explicit", "context", "rule", "embedding", "small_model", "llm_judge", "fallback"]
RiskLevel = Literal["low", "medium", "high"]


@dataclass(frozen=True, slots=True)
class IntentCandidate:
    """候选意图及其校准前后的评分。"""

    intent: IntentType
    score: float
    source: IntentSource
    reason: str


@dataclass(frozen=True, slots=True)
class IntentRoute:
    """AI 消息意图路由结果。"""

    intent: IntentType
    confidence: float
    reason: str
    source: IntentSource
    candidates: tuple[IntentCandidate, ...] = field(default_factory=tuple)
    needs_clarification: bool = False
    fallback_intent: IntentType | None = None
    latency_ms: int = 0
    clarification_prompt: str | None = None


class IntentRuleSpec(BaseModel):
    """单个意图的可解释高精度规则。"""

    model_config = ConfigDict(extra="forbid")

    exact_any: list[str] = Field(default_factory=list)
    contains_any: list[str] = Field(default_factory=list)
    contains_all: list[list[str]] = Field(default_factory=list)
    negative_contains_any: list[str] = Field(default_factory=list)

    @field_validator("exact_any", "contains_any", "negative_contains_any")
    @classmethod
    def normalize_phrase_list(cls, value: list[str]) -> list[str]:
        """清洗规则短语，去掉空字符串。"""
        return [item.strip() for item in value if item and item.strip()]

    @field_validator("contains_all")
    @classmethod
    def normalize_contains_all(cls, value: list[list[str]]) -> list[list[str]]:
        """清洗成组命中的规则短语。"""
        normalized: list[list[str]] = []
        for group in value:
            items = [item.strip() for item in group if item and item.strip()]
            if items:
                normalized.append(items)
        return normalized


class ClarificationPolicyConfig(BaseModel):
    """低置信度和高风险意图的澄清策略。"""

    model_config = ConfigDict(extra="forbid")

    prompt: str = "你是想开始今天的学习、查看学习进度，还是让我帮你制定学习计划？"
    high_risk_prompt: str = "这个操作会创建或读取关键学习数据。请确认你想继续执行哪一类学习动作。"
    code: str = "intent_clarification_required"


class IntentRouterGlobalConfig(BaseModel):
    """Intent Router 全局阈值与 Provider 设置。"""

    model_config = ConfigDict(extra="forbid")

    execution_threshold: float = Field(default=0.6, ge=0, le=1)
    clarification_threshold: float = Field(default=0.44, ge=0, le=1)
    margin_threshold: float = Field(default=0.06, ge=0, le=1)
    high_risk_threshold: float = Field(default=0.82, ge=0, le=1)
    semantic_provider: str = "semantic-router"
    embedding_provider: str = "model_gateway"
    llm_judge_enabled: bool = True
    context_follow_up_phrases: list[str] = Field(default_factory=list)
    context_block_phrases: list[str] = Field(default_factory=list)
    clarification: ClarificationPolicyConfig = Field(default_factory=ClarificationPolicyConfig)

    @field_validator("context_follow_up_phrases", "context_block_phrases")
    @classmethod
    def normalize_context_phrases(cls, value: list[str]) -> list[str]:
        """清洗上下文短追问短语。"""
        return [item.strip() for item in value if item and item.strip()]


class IntentDefinition(BaseModel):
    """Intent Registry 中的单个意图定义。"""

    model_config = ConfigDict(extra="forbid")

    name: IntentType
    display_name: str
    description: str = ""
    enabled: bool = True
    utterances: list[str] = Field(default_factory=list)
    negative_utterances: list[str] = Field(default_factory=list)
    rules: IntentRuleSpec = Field(default_factory=IntentRuleSpec)
    execution_threshold: float | None = Field(default=None, ge=0, le=1)
    clarification_threshold: float | None = Field(default=None, ge=0, le=1)
    margin_threshold: float | None = Field(default=None, ge=0, le=1)
    risk_level: RiskLevel = "low"
    applicable_pages: list[str] = Field(default_factory=list)
    response_route: str = "default_chat"
    allowed_actions: list[str] = Field(default_factory=list)
    priority: int = 100

    @field_validator("display_name")
    @classmethod
    def require_display_name(cls, value: str) -> str:
        """确保意图显示名不为空。"""
        if not value.strip():
            raise ValueError("意图显示名不能为空")
        return value.strip()

    @field_validator("utterances", "negative_utterances", "applicable_pages", "allowed_actions")
    @classmethod
    def normalize_string_list(cls, value: list[str]) -> list[str]:
        """清洗字符串列表并去重。"""
        seen: set[str] = set()
        normalized: list[str] = []
        for item in value:
            text = item.strip()
            if not text or text in seen:
                continue
            seen.add(text)
            normalized.append(text)
        return normalized

    @model_validator(mode="after")
    def validate_examples(self) -> "IntentDefinition":
        """校验启用意图至少有正例或规则。"""
        has_rule = bool(self.rules.exact_any or self.rules.contains_any or self.rules.contains_all)
        if self.enabled and self.name not in {"default_chat", "general_chat"} and not self.utterances and not has_rule:
            raise ValueError(f"{self.name} 启用时必须配置正例或规则")
        if self.risk_level == "high" and not self.allowed_actions:
            raise ValueError(f"{self.name} 为高风险意图时必须声明 allowed_actions")
        return self


class IntentEvaluationCase(BaseModel):
    """离线评测用例。"""

    model_config = ConfigDict(extra="forbid")

    text: str
    expected_intent: IntentType
    course_id: str | None = "deep_learning_001"
    last_intent_route: str | None = None

    @field_validator("text")
    @classmethod
    def require_text(cls, value: str) -> str:
        """确保评测文本不为空。"""
        if not value.strip():
            raise ValueError("评测文本不能为空")
        return value.strip()


class IntentEvaluationTemplate(BaseModel):
    """基于前缀和问题模板展开的离线评测用例。"""

    model_config = ConfigDict(extra="forbid")

    expected_intent: IntentType
    prefixes: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)
    templates: list[str] = Field(default_factory=list)
    course_id: str | None = "deep_learning_001"


class IntentRegistryConfig(BaseModel):
    """Intent Registry YAML 对应的结构化配置。"""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    schema_version: str = "2.0"
    version: str = "builtin"
    description: str = ""
    global_settings: IntentRouterGlobalConfig = Field(default_factory=IntentRouterGlobalConfig, alias="global")
    intents: list[IntentDefinition]
    evaluation_cases: list[IntentEvaluationCase] = Field(default_factory=list)
    evaluation_templates: list[IntentEvaluationTemplate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_registry(self) -> "IntentRegistryConfig":
        """校验意图唯一性和阈值关系。"""
        seen: set[str] = set()
        duplicates: list[str] = []
        for intent in self.intents:
            if intent.name in seen:
                duplicates.append(intent.name)
            seen.add(intent.name)
        if duplicates:
            raise ValueError(f"重复意图：{', '.join(sorted(duplicates))}")
        required = {"start_learning_session", "learning_plan_request", "learning_progress_query", "course_rag_qa", "resource_generation", "default_chat"}
        missing = sorted(required - seen)
        if missing:
            raise ValueError(f"缺少必需意图：{', '.join(missing)}")
        if self.global_settings.clarification_threshold > self.global_settings.execution_threshold:
            raise ValueError("clarification_threshold 不能高于 execution_threshold")
        return self

    def enabled_intents(self) -> list[IntentDefinition]:
        """返回已启用意图，按优先级排序。"""
        return sorted((item for item in self.intents if item.enabled), key=lambda item: item.priority)

    def intent_map(self) -> dict[IntentType, IntentDefinition]:
        """返回按意图名索引的配置。"""
        return {item.name: item for item in self.intents}


class RegistryValidationIssue(BaseModel):
    """Intent Registry 校验错误。"""

    path: str
    message: str
    line: int | None = None
    column: int | None = None


class RegistryValidationResult(BaseModel):
    """Intent Registry 校验结果。"""

    ok: bool
    errors: list[RegistryValidationIssue] = Field(default_factory=list)


class IntentEvalMetrics(BaseModel):
    """单个意图的评测指标。"""

    precision: float
    recall: float
    false_positive: int
    false_negative: int
    support: int = 0


class IntentEvalReport(BaseModel):
    """离线评测报告。"""

    total: int
    correct: int
    accuracy: float
    clarification_rate: float = 0.0
    high_risk_false_positive: int = 0
    by_intent: dict[str, IntentEvalMetrics] = Field(default_factory=dict)


class IntentRouterConfigView(BaseModel):
    """管理端读取的 Intent Router 配置视图。"""

    active_path: str
    active_version: str
    draft_version: str | None = None
    updated_at: str | None = None
    updated_by: str | None = None
    validation: RegistryValidationResult
    evaluation: IntentEvalReport | None = None
    yaml_text: str
    config: dict[str, Any] | None = None
    embedding_warmup_status: str = "not_started"
    has_draft: bool = False

