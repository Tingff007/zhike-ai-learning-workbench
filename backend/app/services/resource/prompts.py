"""个性化 AI 学习资源生成的 prompt 构建工具。

上线要求：资源正文必须来自真实大模型调用。本模块只负责组织 prompt、清洗正文
和生成元信息；不得在模型失败时伪造本地学习资源。
"""
from __future__ import annotations

import re
from typing import Any

PROMPT_VERSION = "resource-v3-strict-model"

TYPE_LABELS = {
    "lecture": "高白话讲义",
    "mindmap": "思维导图",
    "quiz": "阶段测评题",
    "misconception_card": "错题补救卡",
    "ppt": "PPT 大纲",
    "code_lab": "代码实验",
    "video": "视频脚本",
    "reading": "拓展阅读",
    "diagram_pack": "教学图解包",
}

DIFFICULTY_LABELS = {"basic": "初级", "medium": "中级", "advanced": "进阶"}

MODEL_FALLBACK_MARKERS = (
    "本地降级回答",
    "本地兜底",
    "local fallback",
    "模型网关暂时无法完成真实模型调用",
    "模型网关暂不可用",
)

INTERNAL_OUTPUT_SECTION_TITLES = (
    "生成目标",
    "用户任务目标",
    "额外要求",
    "资源类型",
    "难度",
    "学生画像",
    "用户画像",
    "学情画像",
    "掌握度/学情",
    "近期对话意图",
    "课程引用材料",
    "个性化改写指引",
    "画像匹配",
    "个性化依据",
    "生成依据",
    "检索依据",
    "引用依据",
    "检索过程",
    "内部上下文",
    "Prompt",
    "Requirements",
)

SYSTEM_PROMPT = """你是高校课程个性化学习资源作者。你会收到课程、知识点、学生画像、掌握度、近期对话和课程引用材料。

硬性规则：
1. 只输出最终资源正文的 Markdown，不要输出 JSON、不要解释生成过程。
2. 内部信息只用于构思，禁止原样输出画像、掌握度、prompt、requirements、检索过程、引用依据等字段。
3. 必须根据学生画像和掌握度调整讲解深度、例子、练习和语言风格。
4. 不同资源类型必须有明显不同的正文结构。
5. 不要编造论文页码、资料页码或未给出的实验数据。
6. 若引用材料不足，可以基于课程通用知识补全正文，但不要说“未检索到”或“需要补充资料”。"""

MINDMAP_SYSTEM_PROMPT = """你是高校课程个性化学习资源作者，专门生成可审核的 Mermaid 思维导图。

硬性规则：
1. 只输出一个 JSON 对象，不要输出 Markdown 代码块、解释文字或多余字段。
2. JSON 必须包含 chart_type、syntax、source_code 三个字段。
3. source_code 必须是 Mermaid mindmap 源码，第一行固定为 mindmap。
4. 节点文本使用简体中文短句，禁止出现花括号、尖括号、竖线、反引号、Markdown 标题符号。
5. 使用稳定三层结构：root、主要分支、短节点说明；缩进必须使用两个空格的倍数。
6. 不要逐条复制课程引用材料，不要输出检索过程、画像原文或内部字段。"""


def resolve_effective_resource_type(resource_type: str, goal: str, requirements: str | None = None) -> str:
    """把补救型测验意图映射为 misconception_card。"""
    if resource_type != "quiz":
        return resource_type
    text = f"{goal} {requirements or ''}"
    if re.search(r"错题|补救|归因|误区|misconception", text, re.I):
        return "misconception_card"
    return resource_type


def _body_schema(effective_type: str) -> str:
    schemas: dict[str, str] = {
        "lecture": """
正文结构（高白话讲义，按顺序输出）：
- # 一个白话标题
- 一句生活类比解释概念
- ## 是什么
- ## 为什么
- ## 怎么用
- ## 常见误区
- ## 小例子
- ## 记忆提示（恰好 3 条列表项）
- ## 自测一下（1 个问题）
""".strip(),
        "quiz": """
正文结构（阶段测评题）：
- # 测评说明
- ## 选择题（至少 2 道，含 A-D 选项）
- ## 填空题（至少 1 道）
- ## 简答题（至少 1 道）
- ## 实践题（至少 1 道）
- ## 参考答案
- ## 评分要点
- ## 常见错因
- ## 补救建议
不要写讲义式“是什么/为什么/怎么用”。
""".strip(),
        "misconception_card": """
正文结构（错题补救卡）：
- # 你可能卡住的点
- ## 错因诊断
- ## 正确理解
- ## 对比例子（错误做法 vs 正确做法）
- ## 补救练习（2-3 道小题）
- ## 怎么判断自己真的懂了
不要写成完整讲义或套卷。
""".strip(),
        "code_lab": """
正文结构（代码实验，必须含可运行代码）：
- # 实验目标
- ## 环境要求
- ## 文件结构
- ## 实验步骤（编号列表）
- ## 参考代码（```python 代码块，含 TODO 注释）
- ## 你的任务
- ## 预期输出
- ## 思考题
- ## 常见报错与排查
""".strip(),
        "reading": """
正文结构（拓展阅读）：
- # 阅读主题
- ## 为什么值得读
- ## 阅读顺序
- ## 核心材料摘要
- ## 延伸概念
- ## 和当前知识点的关系
- ## 迁移任务
- ## 继续追问（3 个开放问题）
""".strip(),
        "mindmap": """
正文结构（Mermaid 思维导图 JSON 外壳）：
- 只输出 JSON，不输出 Markdown、解释文字或代码块。
- chart_type 固定为 "mindmap"。
- syntax 固定为 "mermaid"。
- source_code 放 Mermaid mindmap 源码，第一行固定为 mindmap。
- 根节点格式固定为：两个空格 + root((知识点名称))。
- 二级节点必须覆盖：定义、前置、关键步骤、常见误区、练习、与后续章节关系。
- 根据学生画像可增加一个短分支，例如代码视角、公式位置、项目应用或面试追问。
- 每个节点文本不超过 28 个中文字符，禁止特殊符号。

示例 JSON：
{
  "chart_type": "mindmap",
  "syntax": "mermaid",
  "source_code": "mindmap\\n  root((深度学习))\\n    定义\\n      多层神经网络学习表示\\n    前置\\n      线性代数和概率基础\\n    关键步骤\\n      前向计算损失\\n    常见误区\\n      混淆参数和激活值\\n    练习\\n      手算一层输出\\n    与后续章节关系\\n      连接反向传播"
}
""".strip(),
        "ppt": """
正文结构（PPT 大纲）：
- # 汇报主题
- 按页输出：## 第 N 页：标题
- 每页包含要点列表和讲稿提示
- ## 演示建议
""".strip(),
        "video": """
正文结构（视频讲解脚本）：
- # 片名
- 按镜头输出：## 镜头 N
- 每个镜头包含旁白、板书要点、互动问题
""".strip(),
    }
    return schemas.get(effective_type, schemas["lecture"])


def _personalization_hints(profile_summary: str | None, difficulty: str) -> str:
    summary = profile_summary or ""
    lowered = summary.lower()
    hints: list[str] = []
    if difficulty == "basic" or "初级" in summary or "基础薄弱" in summary or "beginner" in lowered:
        hints.append("学习者偏初级：多用白话、生活类比，减少公式密度，步骤拆细。")
    if "公式" in summary or "梯度" in summary:
        hints.append("薄弱点含公式或梯度：补充变量含义、计算图位置、常见符号混淆。")
    if "代码" in summary or "实践" in summary or "pytorch" in lowered:
        hints.append("偏好代码实践：在合适处增加伪代码、可运行片段或动手任务。")
    if "矩阵" in summary or "维度" in summary or "张量" in summary:
        hints.append("易错维度/张量：强调 shape、广播、Batch 维与特征维区别。")
    if "链式" in summary or "反向传播" in summary:
        hints.append("近期困惑可能围绕反向传播：用计算图小例子澄清梯度流向。")
    if not hints:
        hints.append("按课程默认节奏组织，保持清晰、可练习、可自检。")
    return "\n".join(f"- {line}" for line in hints)


def build_generation_messages(
    *,
    course_title: str,
    concept_title: str,
    resource_type: str,
    difficulty: str,
    goal: str,
    requirements: str | None,
    profile_summary: str | None,
    citations: list[dict[str, Any]],
    recent_dialog: str | None = None,
    mastery_context: str | None = None,
) -> list[dict[str, str]]:
    """构造资源生成模型调用所需的 system/user 消息。

    该函数负责把课程、知识点、学习画像、近期对话和引用材料压缩成统一提示词，
    并根据目标与要求推断最终资源类型。
    """
    effective_type = resolve_effective_resource_type(resource_type, goal, requirements)
    evidence = "\n".join(
        f"- {item.get('source_title') or item.get('sourceTitle') or '课程资料'}：{str(item.get('snippet') or '')[:240]}"
        for item in citations[:5]
    )
    if not evidence.strip():
        evidence = "- （内部）课程引用材料较少，请基于课程通用知识写完整正文，正文中不要提及检索状态。"

    user_prompt = f"""
【内部 · 课程】{course_title}
【内部 · 知识点】{concept_title}
【内部 · 资源类型】{TYPE_LABELS.get(effective_type, effective_type)}（resource_type={effective_type}）
【内部 · 难度】{DIFFICULTY_LABELS.get(difficulty, difficulty)}
【内部 · 用户任务目标】{goal}
【内部 · 额外要求】{requirements or '无'}
【内部 · 学生画像】
{profile_summary or '暂无画像，按中级学习者默认处理。'}
【内部 · 掌握度/学情】
{mastery_context or '未提供分项掌握度，按课程进度默认。'}
【内部 · 近期对话意图】
{recent_dialog or '无近期对话记录。'}
【内部 · 课程引用材料（勿逐条复制到正文）】
{evidence}

【个性化改写指引（内部，勿输出）】
{_personalization_hints(profile_summary, difficulty)}

{_body_schema(effective_type)}

现在只输出符合上述结构的 Markdown 正文。
""".strip()
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]


def build_mindmap_generation_messages(
    *,
    course_title: str,
    concept_title: str,
    difficulty: str,
    goal: str,
    requirements: str | None,
    profile_summary: str | None,
    citations: list[dict[str, Any]],
    recent_dialog: str | None = None,
    mastery_context: str | None = None,
) -> list[dict[str, str]]:
    """构造 Mermaid 思维导图结构化生成消息。"""

    evidence = "\n".join(
        f"- {item.get('source_title') or item.get('sourceTitle') or '课程资料'}：{str(item.get('snippet') or '')[:220]}"
        for item in citations[:5]
    )
    if not evidence.strip():
        evidence = "- 课程引用材料较少，请基于课程通用知识补全导图，但不要在输出中提及检索状态。"

    user_prompt = f"""
【内部 · 课程】{course_title}
【内部 · 知识点】{concept_title}
【内部 · 难度】{DIFFICULTY_LABELS.get(difficulty, difficulty)}
【内部 · 用户任务目标】{goal}
【内部 · 额外要求】{requirements or '无'}
【内部 · 学生画像】
{profile_summary or '暂无画像，按中级学习者默认处理。'}
【内部 · 掌握度/学情】
{mastery_context or '未提供分项掌握度，按课程进度默认。'}
【内部 · 近期对话意图】
{recent_dialog or '无近期对话记录。'}
【内部 · 课程引用材料（勿逐条复制到导图）】
{evidence}

【个性化改写指引（内部，勿输出）】
{_personalization_hints(profile_summary, difficulty)}

输出契约：
{_body_schema('mindmap')}
""".strip()
    return [
        {"role": "system", "content": MINDMAP_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]


def build_personalization_metadata(profile_summary: str | None, effective_type: str, difficulty: str) -> dict[str, Any]:
    """根据学生画像和资源难度生成前端可展示的个性化元数据。"""
    weak: list[str] = []
    if profile_summary:
        for token in ("公式", "维度", "张量", "梯度", "反向传播", "过拟合"):
            if token in profile_summary:
                weak.append(token)
    level = "beginner" if difficulty == "basic" else "advanced" if difficulty == "advanced" else "intermediate"
    return {
        "learnerLevel": level,
        "weakPoints": weak[:5],
        "adaptationReason": _personalization_hints(profile_summary, difficulty).replace("\n", " "),
        "effectiveResourceType": effective_type,
    }


def local_resource_template(
    *,
    course_title: str,
    concept_title: str,
    resource_type: str,
    difficulty: str,
    goal: str,
    requirements: str | None = None,
    profile_summary: str | None = None,
) -> str:
    """正式资源生成禁止本地模板兜底。

    这个函数保留给旧调用点，但不再返回伪造学习资源。模型 API 未配置、
    网络不可达或供应商失败时，任务应进入 failed 状态，并由前端展示错误原因。
    """
    raise RuntimeError("AI_MODEL_UNAVAILABLE: 未完成真实大模型调用，资源未生成。请检查模型网关配置、网络连接和供应商 API 状态。")


def _heading_level(line: str) -> int | None:
    match = re.match(r"^(#{1,6})\s+", line.strip())
    return len(match.group(1)) if match else None


def _is_internal_heading(line: str) -> bool:
    stripped = line.strip().strip("#：: ")
    return any(stripped.lower() == title.lower() for title in INTERNAL_OUTPUT_SECTION_TITLES)


def _looks_like_internal_block(line: str) -> bool:
    text = line.strip()
    return bool(
        re.match(r"^【内部[ ·].+】", text)
        or re.match(r"^[-*]?\s*(prompt|requirements|trace|router|retrieve|generate|verify)\s*[:：]", text, re.I)
        or any(text.startswith(f"{title}：") or text.startswith(f"{title}:") for title in INTERNAL_OUTPUT_SECTION_TITLES)
    )


def sanitize_generated_resource_content(content: str) -> str:
    """移除内部 Prompt/Trace 材料，并拒绝模型网关本地兜底文本。"""
    raw = (content or "").replace("\r\n", "\n").strip()
    if not raw:
        return ""
    if any(marker.lower() in raw.lower() for marker in MODEL_FALLBACK_MARKERS):
        return ""

    lines = raw.split("\n")
    cleaned: list[str] = []
    skip_level: int | None = None
    for line in lines:
        level = _heading_level(line)
        if skip_level is not None:
            if level is not None and level <= skip_level:
                skip_level = None
            else:
                continue
        if _is_internal_heading(line):
            skip_level = level or 6
            continue
        if _looks_like_internal_block(line):
            continue
        cleaned.append(line.rstrip())

    text = "\n".join(cleaned).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def content_has_forbidden_sections(content: str) -> bool:
    """检测资源正文是否包含旧版通用模板或内部字段章节。"""
    forbidden_titles = {"适用对象", "核心内容", "学习目标", "生成依据", "画像匹配", "内部上下文"}
    for line in (content or "").splitlines():
        stripped = line.strip().strip("#：: ")
        if stripped in forbidden_titles or _is_internal_heading(line) or _looks_like_internal_block(line):
            return True
    return False
