"""阶段测评题结构化生成契约与 Markdown 渲染工具。"""

from __future__ import annotations

import json
import re
from typing import Any


QUIZ_JSON_SYSTEM_PROMPT = """你是高校课程阶段测评题命题专家。"""

QUIZ_JSON_SCHEMA_PROMPT = """
输出字段契约（这是字段说明，不是可复制的题目内容）：
- 顶层字段只能包含 title、description、questions、common_mistakes、remediation。
- title 必须写成“阶段测评题：当前知识点名称”。
- questions 必须恰好 5 道，按顺序输出：single_choice、single_choice、multiple_choice、blank、short_answer。
- 每题字段必须包含 type、prompt、points、options、answer、analysis、scoring_points、keywords。
- single_choice / multiple_choice 的 options 必须是 A-D 四项，每项形如 {"value":"A","label":"具体选项内容"}。
- single_choice 的 answer 是 A-D 单个字符串；multiple_choice 的 answer 是至少 2 个选项组成的字符串数组。
- blank / short_answer 的 options 必须是空数组，answer 必须是可评分的标准答案或参考答案要点。

硬性要求：
0. 只能输出一个 JSON 对象，首字符必须是 {，末字符必须是 }，禁止输出 Markdown、代码块、解释、前后缀说明或多余文本。
1. 题目必须围绕当前知识点和课程引用材料命题，不得输出通用学习策略题。
2. 禁止复制字段说明或占位词，禁止出现：知识点名称、题干、选项内容、正确选项、错误选项、必要步骤、非必要步骤、为什么该答案正确、答案解释、高质量答案应覆盖哪些逻辑、常见错因 1、补救建议 1。
3. 客观题必须在 answer 字段直接给出标准答案；主观题必须给出 answer、scoring_points 和 keywords，供学生提交后 AI 同步评分。
4. 每道题都要有明确教学依据，analysis 必须解释答案为什么成立，不能只写“答案解释”。
5. 如果接口启用了 response_format=json_object，也仍然必须遵守本消息中的字段、题型和业务校验要求。
""".strip()

QUESTION_TYPES = {"single_choice", "multiple_choice", "blank", "short_answer", "practice"}
OPTION_VALUES = ("A", "B", "C", "D")
PLACEHOLDER_PATTERNS = (
    "知识点名称",
    "题干",
    "选项内容",
    "正确选项",
    "错误选项",
    "必要步骤",
    "非必要步骤",
    "为什么该答案正确",
    "答案解释",
    "高质量答案应覆盖哪些逻辑",
    "常见错因 1",
    "常见错因 2",
    "补救建议 1",
    "补救建议 2",
    "关键概念",
    "概念词",
    "应用边界",
)


class QuizContractError(ValueError):
    """阶段测评题 JSON 契约不满足业务要求。"""


def build_quiz_repair_message(*, raw_answer: str, error: Exception) -> dict[str, str]:
    """构造结构化输出修复提示，把原始错误输出和校验原因回传给模型。"""

    clipped_answer = (raw_answer or "").strip()[:3600]
    if "模型未返回 JSON 对象" in str(error):
        return {
            "role": "user",
            "content": (
                "上一次回复不是 JSON。现在只输出一个 JSON 对象，不要解释，不要 Markdown。\n"
                "必须包含字段 title、description、questions、common_mistakes、remediation。\n"
                "questions 恰好 5 道，题型顺序固定为 single_choice、single_choice、multiple_choice、blank、short_answer。\n"
                "每题必须包含 type、prompt、points、options、answer、analysis、scoring_points、keywords。"
            ),
        }
    return {
        "role": "user",
        "content": (
            "上一次输出没有通过阶段测评题 JSON 契约校验。\n"
            f"校验错误：{str(error)[:500]}\n"
            "请基于下面的原始输出修复，不要解释原因，只返回一个合法 JSON 对象。\n"
            "修复要求：questions 恰好 5 道；题型顺序为 single_choice、single_choice、multiple_choice、blank、short_answer；"
            "options 必须是 A-D 四项；scoring_points 和 keywords 必须是字符串数组；blank 和 short_answer 必须有非空 answer。\n"
            "原始输出：\n"
            f"{clipped_answer}"
        ),
    }


def load_quiz_json_object(raw: str) -> dict[str, Any] | None:
    """从模型回复中提取 JSON 对象，包含与严格解析一致的常见语法修复。"""

    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    json_text = text[start : end + 1]
    for candidate in (json_text, _repair_common_json_syntax(json_text)):
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        return data if isinstance(data, dict) else None
    return None


def build_quiz_generation_messages(
    *,
    course_title: str,
    concept_title: str,
    difficulty_label: str,
    goal: str,
    requirements: str | None,
    profile_summary: str | None,
    mastery_context: str | None,
    recent_dialog: str | None,
    evidence: str,
) -> list[dict[str, str]]:
    """构造阶段测评题结构化生成提示词。"""

    user_prompt = f"""
课程：{course_title}
知识点：{concept_title}
难度：{difficulty_label}
生成目标：{goal}
额外要求：{requirements or '无'}
学生画像：{profile_summary or '暂无画像，按中级学习者默认处理。'}
掌握度/学情：{mastery_context or '未提供分项掌握度，按课程进度默认。'}
近期对话意图：{recent_dialog or '无近期对话记录。'}
课程引用材料（只作命题依据，不要逐条复制）：
{evidence}

{QUIZ_JSON_SCHEMA_PROMPT}

本次必须输出：
- title: 阶段测评题：{concept_title}
- questions[0].type: single_choice
- questions[1].type: single_choice
- questions[2].type: multiple_choice
- questions[3].type: blank
- questions[4].type: short_answer

再次强调：你的回复只能是纯 JSON 对象，不要写“以下是 JSON”、不要包裹 ```json 代码块、不要补充任何自然语言。
""".strip()
    return [
        {"role": "user", "content": f"{QUIZ_JSON_SYSTEM_PROMPT}\n\n{user_prompt}"},
    ]


def parse_quiz_json_payload(raw: str) -> dict[str, Any]:
    """清洗并解析模型返回的阶段测评 JSON。"""

    data = load_quiz_json_object(raw)
    if data is None:
        raise QuizContractError("模型未返回 JSON 对象。")
    return validate_quiz_payload(data)


def validate_quiz_payload(data: dict[str, Any]) -> dict[str, Any]:
    """递归校验阶段测评题字段、类型和最小题型配比。"""

    title = _clean_text(data.get("title")) or "阶段测评题"
    description = _clean_text(data.get("description"))
    _reject_placeholder_text(title, "标题")
    _reject_placeholder_text(description, "测评说明")
    raw_questions = _normalize_questions_container(data.get("questions") or data.get("items") or data.get("question_list"))
    if not isinstance(raw_questions, list) or len(raw_questions) != 5:
        raise QuizContractError("阶段测评题必须恰好 5 道题。")

    questions = [_validate_question(item, index + 1) for index, item in enumerate(raw_questions)]
    counts = {
        "single_choice": sum(1 for item in questions if item["type"] == "single_choice"),
        "multiple_choice": sum(1 for item in questions if item["type"] == "multiple_choice"),
        "blank": sum(1 for item in questions if item["type"] == "blank"),
        "short_answer": sum(1 for item in questions if item["type"] in {"short_answer", "practice"}),
    }
    if counts["single_choice"] < 2 or counts["multiple_choice"] < 1 or counts["blank"] < 1 or counts["short_answer"] < 1:
        raise QuizContractError("阶段测评题型配比不满足：至少 2 单选、1 多选、1 填空、1 简答。")

    common_mistakes = _clean_list(data.get("common_mistakes"))[:6]
    remediation = _clean_list(data.get("remediation"))[:6]
    for index, item in enumerate(common_mistakes, start=1):
        _reject_placeholder_text(item, f"常见错因第 {index} 项")
    for index, item in enumerate(remediation, start=1):
        _reject_placeholder_text(item, f"补救建议第 {index} 项")

    return {
        "title": title,
        "description": description,
        "questions": questions,
        "common_mistakes": common_mistakes,
        "remediation": remediation,
    }


def render_quiz_markdown(payload: dict[str, Any]) -> str:
    """把校验后的结构化题单渲染为前端解析器兼容的 Markdown。"""

    questions = list(payload["questions"])
    lines: list[str] = [f"# {payload['title']}", ""]
    if payload.get("description"):
        lines.extend(["## 测评说明", str(payload["description"]), ""])
    sections: tuple[tuple[str, str], ...] = (
        ("single_choice", "单选题"),
        ("multiple_choice", "多选题"),
        ("blank", "填空题"),
        ("short_answer", "简答题"),
        ("practice", "实践题"),
    )
    global_orders: dict[int, int] = {}
    display_order = 1
    for question_type, section_title in sections:
        group_questions = [item for item in questions if item["type"] == question_type]
        if not group_questions:
            continue
        lines.extend([f"## {section_title}", ""])
        for question in group_questions:
            global_orders[id(question)] = display_order
            lines.append(f"{display_order}. {_render_question_body(question)}")
            display_order += 1
        lines.append("")

    lines.extend(["## 参考答案", ""])
    for question_type, _section_title in sections:
        group_questions = [item for item in questions if item["type"] == question_type]
        if not group_questions:
            continue
        for question in group_questions:
            lines.append(f"{global_orders[id(question)]}. {_stringify_answer(question['answer'])}")
    lines.append("")

    lines.extend(["## 评分要点", ""])
    for question_type, _section_title in sections:
        group_questions = [item for item in questions if item["type"] == question_type]
        if not group_questions:
            continue
        for question in group_questions:
            points = "；".join(question["scoring_points"] or question["keywords"] or [question["analysis"]])
            lines.append(f"{global_orders[id(question)]}. {points}")
    lines.append("")

    if payload.get("common_mistakes"):
        lines.extend(["## 常见错因", ""])
        lines.extend(f"- {item}" for item in payload["common_mistakes"])
        lines.append("")
    if payload.get("remediation"):
        lines.extend(["## 补救建议", ""])
        lines.extend(f"- {item}" for item in payload["remediation"])
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def build_fallback_quiz_payload(*, concept_title: str, concept_definition: str | None = None) -> dict[str, Any]:
    """构造服务端标准化兜底题单，保证测评页在模型格式异常时仍可用。"""

    definition = _clean_text(concept_definition) or f"{concept_title}的定义、核心作用、适用条件和常见误区。"
    return validate_quiz_payload(
        {
            "title": f"阶段测评题：{concept_title}",
            "description": f"围绕「{concept_title}」检查概念理解、判断辨析和表达应用。",
            "questions": [
                {
                    "type": "single_choice",
                    "prompt": f"关于「{concept_title}」的学习目标，以下哪一项最符合阶段测评要求？",
                    "points": 2,
                    "options": [
                        {"value": "A", "label": "能够说明概念含义、解决的问题、关键条件和适用边界。"},
                        {"value": "B", "label": "只记住标题即可，不需要理解输入输出或使用场景。"},
                        {"value": "C", "label": "只要背出一个关键词，就可以跳过相关练习。"},
                        {"value": "D", "label": "所有题目都可以套用同一个结论，不需要看条件。"},
                    ],
                    "answer": "A",
                    "analysis": "阶段测评检查的是概念、条件、边界和迁移使用，而不是只记住名称。",
                    "scoring_points": ["识别完整理解标准"],
                    "keywords": [concept_title, "条件", "边界"],
                },
                {
                    "type": "single_choice",
                    "prompt": f"复习「{concept_title}」时，哪种做法最能避免形成表面掌握？",
                    "points": 2,
                    "options": [
                        {"value": "A", "label": "结合定义、例子和反例说明它何时适用、何时不适用。"},
                        {"value": "B", "label": "只阅读目录，不需要做任何自测。"},
                        {"value": "C", "label": "只复制讲义原句，不检查是否能解释。"},
                        {"value": "D", "label": "遇到不确定点时先跳过，提交后也不复盘。"},
                    ],
                    "answer": "A",
                    "analysis": "例子、反例和适用边界能暴露理解漏洞。",
                    "scoring_points": ["识别有效复习策略"],
                    "keywords": [concept_title, "例子", "反例"],
                },
                {
                    "type": "multiple_choice",
                    "prompt": f"判断自己是否掌握「{concept_title}」时，哪些证据通常是可靠的？",
                    "points": 3,
                    "options": [
                        {"value": "A", "label": "能用自己的话解释核心定义。"},
                        {"value": "B", "label": "能指出一个适用场景或反例。"},
                        {"value": "C", "label": "能说明常见错误为什么错。"},
                        {"value": "D", "label": "只看过题目标题但没有完成作答。"},
                    ],
                    "answer": ["A", "B", "C"],
                    "analysis": "可靠掌握证据来自解释、迁移和错因辨析。",
                    "scoring_points": ["选择 A/B/C 且不选择 D"],
                    "keywords": [concept_title, "解释", "迁移", "错因"],
                },
                {
                    "type": "blank",
                    "prompt": f"请补全：学习「{concept_title}」时，除了记住定义，还要能说明其适用条件和______。",
                    "points": 2,
                    "options": [],
                    "answer": "边界",
                    "analysis": "边界条件决定概念是否能被正确迁移使用。",
                    "scoring_points": ["填写边界、限制、适用边界等同义表达均可"],
                    "keywords": ["边界", "限制", "适用边界"],
                },
                {
                    "type": "short_answer",
                    "prompt": f"请用 2-4 句话说明你对「{concept_title}」的理解，并结合本知识点解释一个容易混淆的地方。",
                    "points": 5,
                    "options": [],
                    "answer": f"应围绕「{concept_title}」说明：{definition} 同时指出一个易混点，并说明如何避免该错误。",
                    "analysis": "主观题重点看概念准确、推理完整和错因辨析。",
                    "scoring_points": ["说明核心含义", "结合适用条件或场景", "指出易混点并解释原因"],
                    "keywords": [concept_title, "含义", "场景", "易混点"],
                },
            ],
            "common_mistakes": ["只记标题不理解边界", "无法举例说明适用场景"],
            "remediation": ["回看讲义定义和例子", "补做一组辨析题", "用自己的话重述关键步骤"],
        }
    )


def normalize_quiz_payload_with_fallbacks(
    data: dict[str, Any],
    *,
    concept_title: str,
    concept_definition: str | None = None,
) -> dict[str, Any]:
    """将模型半结构化题单修复为可评分题单，无法可靠修复的题用标准题替换。"""

    fallback = build_fallback_quiz_payload(concept_title=concept_title, concept_definition=concept_definition)
    title = _clean_text(data.get("title")) or str(fallback["title"])
    description = _clean_text(data.get("description")) or str(fallback["description"])
    raw_questions = _normalize_questions_container(data.get("questions") or data.get("items") or data.get("question_list"))
    raw_list = raw_questions if isinstance(raw_questions, list) else []
    expected_types = ["single_choice", "single_choice", "multiple_choice", "blank", "short_answer"]
    repaired_questions: list[dict[str, Any]] = []

    for index, expected_type in enumerate(expected_types):
        fallback_question = fallback["questions"][index]
        raw_item = raw_list[index] if index < len(raw_list) and isinstance(raw_list[index], dict) else {}
        candidate = _repair_question_candidate(
            raw_item,
            fallback_question=fallback_question,
            expected_type=expected_type,
            concept_title=concept_title,
        )
        try:
            repaired_questions.append(_validate_question(candidate, index + 1))
        except QuizContractError:
            repaired_questions.append(fallback_question)

    return validate_quiz_payload(
        {
            "title": title if "知识点名称" not in title else fallback["title"],
            "description": description,
            "questions": repaired_questions,
            "common_mistakes": _clean_list(data.get("common_mistakes")) or fallback["common_mistakes"],
            "remediation": _clean_list(data.get("remediation")) or fallback["remediation"],
        }
    )


def _repair_question_candidate(
    item: dict[str, Any],
    *,
    fallback_question: dict[str, Any],
    expected_type: str,
    concept_title: str,
) -> dict[str, Any]:
    """修复单题常见字段跑偏，尽量保留模型生成的可用题干。"""

    prompt = _clean_text(item.get("prompt") or item.get("question") or item.get("stem") or fallback_question["prompt"])
    if len(prompt) < 8:
        prompt = fallback_question["prompt"]
    analysis = _clean_text(item.get("analysis") or item.get("explanation") or item.get("rationale"))
    options = item.get("options")
    if expected_type in {"single_choice", "multiple_choice"}:
        repaired_options = _repair_options(options, fallback_question["options"])
        answer = _first_present(item, "answer", "correct_answer", "reference_answer", "expected_answer")
        if expected_type == "single_choice" and _clean_text(answer).upper() not in OPTION_VALUES:
            answer = fallback_question["answer"]
        if expected_type == "multiple_choice":
            answer_values = _answer_values(answer)
            if len(answer_values) < 2 or any(value not in OPTION_VALUES for value in answer_values):
                answer = fallback_question["answer"]
        if not analysis:
            analysis = f"请结合「{concept_title}」的定义、构造过程和选项差异判断。"
    else:
        repaired_options = []
        answer = _clean_text(_first_present(item, "answer", "correct_answer", "reference_answer", "expected_answer"))
        if not answer:
            answer = fallback_question["answer"]
        if not analysis:
            analysis = fallback_question["analysis"]

    scoring_points = _clean_list(item.get("scoring_points") or item.get("rubric") or item.get("score_points"))
    keywords = _clean_list(item.get("keywords"))
    if not scoring_points or all(item.isdigit() for item in scoring_points):
        scoring_points = list(fallback_question["scoring_points"])
    if not keywords:
        keywords = [concept_title, *list(fallback_question["keywords"])[:2]]
    return {
        "type": expected_type,
        "prompt": prompt,
        "points": item.get("points") or fallback_question["points"],
        "options": repaired_options,
        "answer": answer,
        "analysis": analysis,
        "scoring_points": scoring_points,
        "keywords": keywords,
    }


def _repair_options(value: Any, fallback_options: list[dict[str, str]]) -> list[dict[str, str]]:
    """把模型常见的选项字典或字符串数组修复为 A-D 对象数组。"""

    try:
        return _validate_options(value, 0)
    except QuizContractError:
        return fallback_options


def _answer_values(value: Any) -> list[str]:
    """提取选择题答案字母。"""

    if isinstance(value, list):
        return [_clean_text(item).upper() for item in value if _clean_text(item)]
    if isinstance(value, str):
        return [part.strip().upper() for part in re.split(r"[,，、/]", value) if part.strip()]
    return []


def _validate_question(item: Any, index: int) -> dict[str, Any]:
    """校验单题结构并归一化字段。"""

    if not isinstance(item, dict):
        raise QuizContractError(f"第 {index} 题必须是对象。")
    question_type = _normalize_question_type(item)
    if question_type not in QUESTION_TYPES:
        raise QuizContractError(f"第 {index} 题题型不合法。")
    prompt = _clean_text(item.get("prompt") or item.get("question") or item.get("stem") or item.get("title"))
    if not prompt:
        raise QuizContractError(f"第 {index} 题缺少题干。")
    _reject_placeholder_text(prompt, f"第 {index} 题题干")
    points = _coerce_points(item.get("points"), question_type)
    options = _validate_options(item.get("options"), index) if question_type in {"single_choice", "multiple_choice"} else []
    answer = _validate_answer(_first_present(item, "answer", "correct_answer", "reference_answer", "expected_answer"), question_type, options, index)
    analysis = _clean_text(item.get("analysis") or item.get("explanation") or item.get("rationale"))
    scoring_points = _clean_list(item.get("scoring_points") or item.get("rubric") or item.get("score_points"))
    keywords = _clean_list(item.get("keywords"))
    _reject_placeholder_text(answer, f"第 {index} 题答案")
    _reject_placeholder_text(analysis, f"第 {index} 题解析")
    for scoring_index, point in enumerate(scoring_points, start=1):
        _reject_placeholder_text(point, f"第 {index} 题评分点 {scoring_index}")
    for keyword_index, keyword in enumerate(keywords, start=1):
        _reject_placeholder_text(keyword, f"第 {index} 题关键词 {keyword_index}")
    if question_type in {"short_answer", "practice"} and not (scoring_points and keywords):
        raise QuizContractError(f"第 {index} 题主观题必须包含评分要点和关键词。")
    if not analysis:
        analysis = "请结合参考答案和评分要点复盘。"
    return {
        "type": question_type,
        "prompt": prompt,
        "points": points,
        "options": options,
        "answer": answer,
        "analysis": analysis,
        "scoring_points": scoring_points[:8],
        "keywords": keywords[:10],
    }


def _normalize_questions_container(value: Any) -> list[Any] | Any:
    """兼容模型把题目按题型分组输出的情况。"""

    if isinstance(value, list):
        return value
    if not isinstance(value, dict):
        return value
    result: list[Any] = []
    group_aliases = {
        "single_choice": ("single_choice", "single_choices", "单选题", "单选"),
        "multiple_choice": ("multiple_choice", "multiple_choices", "多选题", "多选"),
        "blank": ("blank", "blanks", "fill_blank", "填空题", "填空"),
        "short_answer": ("short_answer", "short_answers", "subjective", "简答题", "简答"),
        "practice": ("practice", "practices", "实践题", "实践"),
    }
    for question_type, aliases in group_aliases.items():
        for alias in aliases:
            group = value.get(alias)
            if not isinstance(group, list):
                continue
            for item in group:
                if isinstance(item, dict) and not item.get("type"):
                    result.append({**item, "type": question_type})
                else:
                    result.append(item)
            break
    return result


def _normalize_question_type(item: dict[str, Any]) -> str:
    """兼容中文题型或常见英文别名。"""

    raw = _clean_text(item.get("type") or item.get("question_type") or item.get("kind")).lower()
    aliases = {
        "single": "single_choice",
        "single-choice": "single_choice",
        "choice": "single_choice",
        "单选": "single_choice",
        "单选题": "single_choice",
        "multiple": "multiple_choice",
        "multi_choice": "multiple_choice",
        "multiple-choice": "multiple_choice",
        "多选": "multiple_choice",
        "多选题": "multiple_choice",
        "fill_blank": "blank",
        "fill-in-the-blank": "blank",
        "填空": "blank",
        "填空题": "blank",
        "subjective": "short_answer",
        "short": "short_answer",
        "简答": "short_answer",
        "简答题": "short_answer",
        "实践": "practice",
        "实践题": "practice",
    }
    return aliases.get(raw, raw)


def _first_present(item: dict[str, Any], *keys: str) -> Any:
    """按常见别名读取第一个非空字段。"""

    for key in keys:
        value = item.get(key)
        if value not in (None, "", []):
            return value
    return None


def _validate_options(value: Any, question_index: int) -> list[dict[str, str]]:
    """校验选择题选项，仅允许 A-D。"""

    if isinstance(value, dict):
        value = [{"value": key, "label": label} for key, label in value.items()]
    if not isinstance(value, list) or len(value) != 4:
        raise QuizContractError(f"第 {question_index} 题选择题必须提供 A-D 四个选项。")
    options: list[dict[str, str]] = []
    for expected, item in zip(OPTION_VALUES, value, strict=True):
        if isinstance(item, dict):
            option_value = _clean_text(item.get("value") or expected).upper()
            label = _clean_text(item.get("label") or item.get("text") or item.get("content"))
        else:
            option_value = expected
            label = _clean_text(item)
        if option_value != expected or not label:
            raise QuizContractError(f"第 {question_index} 题选项必须按 A-D 顺序且内容不能为空。")
        _reject_placeholder_text(label, f"第 {question_index} 题选项 {option_value}")
        options.append({"value": option_value, "label": label})
    return options


def _validate_answer(value: Any, question_type: str, options: list[dict[str, str]], question_index: int) -> str | list[str]:
    """校验标准答案类型和范围。"""

    option_values = {item["value"] for item in options}
    if question_type == "single_choice":
        answer = _clean_text(value).upper()
        if answer not in option_values:
            raise QuizContractError(f"第 {question_index} 题单选答案必须是 A-D。")
        return answer
    if question_type == "multiple_choice":
        if isinstance(value, str):
            answers = [part.strip().upper() for part in re.split(r"[,，、/]", value) if part.strip()]
        elif isinstance(value, list):
            answers = [_clean_text(item).upper() for item in value]
        else:
            answers = []
        if len(answers) < 2 or any(answer not in option_values for answer in answers):
            raise QuizContractError(f"第 {question_index} 题多选答案必须包含至少两个 A-D 选项。")
        answers = sorted(set(answers), key=OPTION_VALUES.index)
        return answers
    answer_text = _clean_text(value)
    if not answer_text:
        raise QuizContractError(f"第 {question_index} 题缺少标准答案。")
    return answer_text


def _reject_placeholder_text(value: Any, field_label: str) -> None:
    """拦截模型照抄提示词示例或输出占位内容，避免不可用题单进入评分流程。"""

    if isinstance(value, list):
        text = " ".join(_clean_text(item) for item in value)
    else:
        text = _clean_text(value)
    if not text:
        return
    for pattern in PLACEHOLDER_PATTERNS:
        if pattern in text:
            raise QuizContractError(f"{field_label}包含占位内容“{pattern}”。")


def _repair_common_json_syntax(text: str) -> str:
    """修复 Lite 模型常见的局部 JSON 语法跑偏，无法修复时返回原文。"""

    repaired = text
    # 常见错误：把字符串数组写成 "keywords": "继承", "构造模型"。
    repaired = re.sub(
        r'("(?:keywords|scoring_points)"\s*:\s*)"([^"]+)"\s*,\s*"([^"]+)"(?=\s*[,}\]])',
        r'\1["\2", "\3"]',
        repaired,
    )
    return repaired


def _render_question_body(question: dict[str, Any]) -> str:
    """渲染题干和选项为单行，兼容现有前端解析器。"""

    if not question["options"]:
        return question["prompt"]
    options_text = " ".join(f"{option['value']}. {option['label']}" for option in question["options"])
    return f"{question['prompt']} {options_text}"


def _stringify_answer(value: str | list[str]) -> str:
    """把标准答案转换为 Markdown 文本。"""

    if isinstance(value, list):
        return "、".join(value)
    return value


def _clean_text(value: Any) -> str:
    """清理模型输出中的空白和 Markdown 装饰。"""

    return re.sub(r"\s+", " ", str(value or "").replace("**", "").replace("`", "")).strip()


def _clean_list(value: Any) -> list[str]:
    """归一化字符串数组字段。"""

    if isinstance(value, str):
        return [_clean_text(item) for item in re.split(r"[；;。]\s*", value) if _clean_text(item)]
    if isinstance(value, (int, float)):
        return [_clean_text(value)]
    if not isinstance(value, list):
        return []
    return [_clean_text(item) for item in value if _clean_text(item)]


def _coerce_points(value: Any, question_type: str) -> int:
    """读取分值并限制到合理范围。"""

    try:
        points = int(value)
    except (TypeError, ValueError):
        points = 5 if question_type in {"short_answer", "practice"} else 2
    return max(1, min(20, points))
