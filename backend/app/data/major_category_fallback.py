"""专业二级类目兜底索引：LLM 超时或失败时规则层返回通用卡片。"""

from __future__ import annotations

from app.schemas.onboarding import ChipOption

MAJOR_CATEGORY_FALLBACK_CHIPS: dict[str, list[ChipOption]] = {
    "工学": [
        ChipOption(
            id="eng_math",
            label="高等数学/线性代数",
            icon="📐",
            payload="我工科数学基础还可以",
            category="knowledge_base",
        ),
        ChipOption(
            id="eng_prog",
            label="编程基础（C/Python）",
            icon="💻",
            payload="我有一定的编程基础",
            category="knowledge_base",
        ),
        ChipOption(
            id="eng_project",
            label="做过课程项目",
            icon="🔧",
            payload="我做过一些工科课程项目",
            category="knowledge_base",
        ),
    ],
    "理学": [
        ChipOption(
            id="sci_math",
            label="数学分析/高等代数",
            icon="📖",
            payload="我数理基础比较扎实",
            category="knowledge_base",
        ),
        ChipOption(
            id="sci_phys",
            label="普通物理",
            icon="⚛️",
            payload="我物理基础需要补一下",
            category="knowledge_base",
        ),
        ChipOption(
            id="sci_lab",
            label="实验操作熟练",
            icon="🔬",
            payload="我做实验比较熟练",
            category="knowledge_base",
        ),
    ],
    "人文社科": [
        ChipOption(
            id="hum_reading",
            label="文献阅读与综述",
            icon="📚",
            payload="我文献阅读能力还行",
            category="knowledge_base",
        ),
        ChipOption(
            id="hum_stat",
            label="统计学基础",
            icon="📊",
            payload="我需要补一下统计基础",
            category="knowledge_base",
        ),
    ],
    "商学": [
        ChipOption(
            id="bus_eco",
            label="经济学基础",
            icon="💹",
            payload="我经济学基础不错",
            category="knowledge_base",
        ),
        ChipOption(
            id="bus_stat",
            label="统计学/计量",
            icon="📈",
            payload="我统计基础需要加强",
            category="knowledge_base",
        ),
    ],
    "通用": [
        ChipOption(
            id="gen_basic",
            label="基础阶段",
            icon="🔰",
            payload="我目前还在打基础阶段",
            category="knowledge_base",
        ),
        ChipOption(
            id="gen_mid",
            label="中等水平",
            icon="📘",
            payload="我已有一定基础，正在进阶",
            category="knowledge_base",
        ),
        ChipOption(
            id="gen_adv",
            label="比较扎实",
            icon="🎯",
            payload="我的基础比较扎实",
            category="knowledge_base",
        ),
    ],
}

# 关键词 → 类目映射
_CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "工学": ("计算机", "软件", "电子", "信息", "机械", "自动化", "土木", "化工", "电气", "通信", "工程"),
    "理学": ("物理", "化学", "生物", "数学", "统计", "天文", "地理", "科学"),
    "人文社科": ("文学", "历史", "哲学", "社会学", "政治", "法学", "新闻", "教育", "语言"),
    "商学": ("金融", "会计", "管理", "经济", "商务", "市场", "工商"),
}


def resolve_major_category(major_text: str) -> str:
    """根据用户输入的专业名称判定二级类目。"""

    text = major_text.strip().lower()
    if not text:
        return "通用"
    for category, keywords in _CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in major_text or keyword.lower() in text:
                return category
    return "通用"


def fallback_chips_for_major(major_text: str) -> list[ChipOption]:
    """取出对应类目的兜底卡片。"""

    category = resolve_major_category(major_text)
    return list(MAJOR_CATEGORY_FALLBACK_CHIPS.get(category, MAJOR_CATEGORY_FALLBACK_CHIPS["通用"]))
