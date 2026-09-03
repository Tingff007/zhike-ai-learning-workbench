"""冷启动引导向导服务：检测、轮次推断、卡片生成与 meta 组装。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data.major_category_fallback import fallback_chips_for_major
from app.models import ProfileDimension, User, UserProfile
from app.schemas.onboarding import (
    ChipOption,
    OnboardingDimensionBrief,
    OnboardingHistoryMessage,
    OnboardingMetadata,
    PresetChipSubmitResponse,
)
from app.services.profile.extractor import DIMENSION_NAMES, ExtractedDimension
from app.services.profile.repository import LearningProfileRepository

ACTIVE_STATUS = "active"

# 第 1 轮预设卡片
ROUND1_CHIPS: list[ChipOption] = [
    ChipOption(
        id="major_cs",
        label="计算机科学",
        icon="🖥",
        payload="我学计算机科学",
        category="major_background",
    ),
    ChipOption(
        id="major_ds",
        label="数据科学",
        icon="📊",
        payload="我学数据科学",
        category="major_background",
    ),
    ChipOption(
        id="major_auto",
        label="自动化",
        icon="⚙️",
        payload="我学自动化",
        category="major_background",
    ),
    ChipOption(
        id="major_ee",
        label="电子信息",
        icon="📡",
        payload="我学电子信息",
        category="major_background",
    ),
    ChipOption(
        id="major_other",
        label="其他",
        icon="➕",
        payload="我的专业不在上述选项中",
        category="major_background",
    ),
]

# 第 2 轮：按专业关键词动态适配
ROUND2_CHIPS_BY_MAJOR: dict[str, list[ChipOption]] = {
    "计算机": [
        ChipOption(id="cs_beginner", label="刚学语法", icon="🔰", payload="我刚学完编程语法基础", category="knowledge_base"),
        ChipOption(id="cs_project", label="能写小项目", icon="🧩", payload="我能写一些小项目", category="knowledge_base"),
        ChipOption(id="cs_system", label="做过完整系统", icon="🚀", payload="我做过完整的系统项目", category="knowledge_base"),
    ],
    "数据科学": [
        ChipOption(id="ds_math_basic", label="正在补线代/概率", icon="📖", payload="我正在补微积分和线性代数的基础", category="knowledge_base"),
        ChipOption(id="ds_math_mid", label="常用模型推导没问题", icon="🧮", payload="我常用的模型推导没什么问题", category="knowledge_base"),
        ChipOption(id="ds_math_adv", label="竞赛/强基水平", icon="🎯", payload="我参加过数学竞赛，数学基础比较扎实", category="knowledge_base"),
    ],
    "自动化": [
        ChipOption(id="auto_phys", label="正在补大学物理", icon="📐", payload="我正在补大学物理基础", category="knowledge_base"),
        ChipOption(id="auto_classic", label="经典控制理论掌握", icon="⚙️", payload="经典控制理论我掌握得不错", category="knowledge_base"),
        ChipOption(id="auto_modern", label="现代控制理论熟悉", icon="🔬", payload="现代控制理论我也比较熟悉", category="knowledge_base"),
    ],
    "电子信息": [
        ChipOption(id="ee_circuit", label="电路分析基础", icon="🔌", payload="电路分析基础还可以", category="knowledge_base"),
        ChipOption(id="ee_signal", label="信号与系统", icon="📶", payload="信号与系统有一定基础", category="knowledge_base"),
        ChipOption(id="ee_embedded", label="嵌入式开发", icon="💾", payload="我做过嵌入式相关项目", category="knowledge_base"),
    ],
}

# 第 3 轮：痛点挖掘
ROUND3_CHIPS: list[ChipOption] = [
    ChipOption(id="weak_debug", label="代码 Debug", icon="🐛", payload="我最容易在代码调试上卡壳", category="weakness"),
    ChipOption(id="weak_formula", label="公式推导", icon="📐", payload="公式推导是我最容易卡壳的地方", category="weakness"),
    ChipOption(id="weak_apply", label="场景应用", icon="📝", payload="把知识用到实际场景时我容易卡住", category="weakness"),
    ChipOption(id="weak_custom", label="自行补充", icon="🔍", payload="我想自己描述一下容易卡壳的地方", category="weakness"),
]

ROUND_QUESTIONS: dict[int, str] = {
    1: "你好！我是你的 AI 学习助手。\n\n为了更好地陪你走过整个大学学习旅程，我需要先简单了解一下你。\n\n你现在主修的专业方向是？",
    2: "很有前景！你目前的{domain}基础处于哪个阶段？",
    3: "在学习中，你最容易在哪种类型的题目上卡壳？",
}

CLOSING_MESSAGE = (
    "我已为你建立初步画像，剩余维度我会在你后续做题和看视频中悄悄学习哦！"
    "现在开始你的学习之旅吧！"
)

DOMAIN_BY_MAJOR: dict[str, str] = {
    "计算机": "编程",
    "数据科学": "数学",
    "自动化": "物理/控制理论",
    "电子信息": "电路与信号",
}

# 预设 chip 直写：第 1 轮回答专业后，按 chip.value 中的专业关键词生成第 2 轮模板话术
PRESET_CHIP_ROUND2_REPLY_BY_MAJOR: dict[str, str] = {
    "计算机": "计算机科学很有前景！你目前的编程基础处于哪个阶段？",
    "数据科学": "数据科学很有前景！你目前的数学基础处于哪个阶段？",
    "自动化": "自动化很有前景！你目前的物理/控制理论基础如何？",
    "电子信息": "电子信息很有前景！你目前的电路信号基础处于哪个阶段？",
}

# 预设 chip 直写：第 2 轮回答知识基础后，进入第 3 轮痛点挖掘的固定话术
PRESET_CHIP_ROUND3_REPLY = "了解了。在学习中，你最容易在哪种类型的题目上卡壳？"


class OnboardingService:
    """冷启动引导业务逻辑。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def is_cold_start(self, user_external_id: str) -> bool:
        """判断用户是否处于冷启动阶段。"""

        user = self.db.execute(select(User).where(User.external_id == user_external_id)).scalar_one_or_none()
        if not user:
            return True
        profile = self.db.execute(select(UserProfile).where(UserProfile.user_id == user.id)).scalar_one_or_none()
        if not profile:
            return True
        rows = self.db.execute(
            select(ProfileDimension).where(
                ProfileDimension.user_profile_id == profile.id,
                ProfileDimension.profile_scope == "global",
                ProfileDimension.status == ACTIVE_STATUS,
            )
        ).scalars().all()
        if any(row.dimension_key in {"weakness", "general_weakness"} for row in rows):
            return False
        valid = [row for row in rows if (row.confidence or 0.0) >= 0.4]
        if len(valid) >= 3:
            return False
        if rows and all((row.confidence or 0.0) < 0.4 for row in rows):
            return True
        return len(valid) < 3

    @staticmethod
    def infer_completed_round(history: list[OnboardingHistoryMessage]) -> int:
        """根据 history 中用户消息数量推断已完成轮次（1-3）。"""

        user_turns = sum(1 for item in history if item.role == "user")
        return min(max(user_turns, 0), 3)

    @staticmethod
    def infer_next_round(history: list[OnboardingHistoryMessage]) -> int:
        """推断下一轮次序号。"""

        return min(OnboardingService.infer_completed_round(history) + 1, 3)

    @staticmethod
    def infer_round(history: list[OnboardingHistoryMessage]) -> int:
        """兼容旧调用：返回下一轮次。"""

        return OnboardingService.infer_next_round(history)

    @staticmethod
    def detect_duplicate_answer(message: str, history: list[OnboardingHistoryMessage]) -> bool:
        """检测用户是否连续提交相同回答。"""

        user_messages = [item.content.strip() for item in history if item.role == "user"]
        if not user_messages:
            return False
        return user_messages[-1].strip() == message.strip()

    @staticmethod
    def extract_major_from_history(history: list[OnboardingHistoryMessage]) -> str:
        """从第 1 轮用户回答中提取专业关键词。"""

        for item in history:
            if item.role != "user":
                continue
            text = item.content
            for keyword in ("计算机", "数据科学", "自动化", "电子信息", "软件", "人工智能", "物理", "数学"):
                if keyword in text:
                    return keyword
            return text.strip()
        return ""

    @staticmethod
    def build_llm_chips_prompt(round_num: int, history: list[OnboardingHistoryMessage]) -> str:
        """构建 LLM 动态生成芯片的 prompt 片段（第 2 轮及以上使用）。"""

        major = OnboardingService.extract_major_from_history(history)
        return (
            f"当前引导第 {round_num} 轮。学生专业方向：{major or '未知'}。\n"
            "请根据学生对第 1 轮的答案和当前专业背景，"
            "动态推断最适合该学生的第 2 轮问题建议选项。\n"
            "输出格式（严格 JSON 数组，不要 markdown）：\n"
            '[{"id": "opt_1", "label": "显示文字", "icon": "🔰", '
            '"payload": "完整的自然语言句子", "category": "knowledge_base"}]\n'
            "每个 payload 必须是完整的自然语言句子（如\"我刚学完编程基础\"），\n"
            "严禁使用 code、缩写或 ID。最多生成 3 个选项。"
        )

    def build_chips(self, round_num: int, user_message: str, history: list[OnboardingHistoryMessage]) -> list[ChipOption]:
        """生成当前轮次的快捷卡片。"""

        if round_num == 1:
            return list(ROUND1_CHIPS)
        if round_num == 2:
            # 通道 A：LLM 动态生成（由 workflow.py 在调用前设置 _llm_chips）
            if hasattr(self, "_llm_chips") and self._llm_chips:
                chips = self._llm_chips
                self._llm_chips = None
                return chips
            # 通道 B：规则关键词匹配
            major = self.extract_major_from_history(history) or user_message
            for key, chips in ROUND2_CHIPS_BY_MAJOR.items():
                if key in major:
                    return list(chips)
            # 通道 C：类目兜底索引
            return fallback_chips_for_major(major)
        if round_num == 3:
            return list(ROUND3_CHIPS)
        return []

    def build_question(self, round_num: int, history: list[OnboardingHistoryMessage]) -> str:
        """生成当前轮次 AI 问题文本。"""

        if round_num == 1:
            return ROUND_QUESTIONS[1]
        if round_num == 2:
            major = self.extract_major_from_history(history)
            domain = "相关领域"
            for key, label in DOMAIN_BY_MAJOR.items():
                if key in major:
                    domain = label
                    break
            if domain == "相关领域" and major:
                domain = f"{major}相关"
            prefix = f"{major}很有前景！" if major else "很好！"
            return f"{prefix}你目前的{domain}基础处于哪个阶段？"
        if round_num == 3:
            return ROUND3_CHIPS and ROUND_QUESTIONS[3] or "在学习中，你最容易在哪种类型的题目上卡壳？"
        return CLOSING_MESSAGE

    def build_current_dimensions(self, user_external_id: str) -> list[OnboardingDimensionBrief]:
        """读取当前全局画像维度供标签云展示。"""

        user = self.db.execute(select(User).where(User.external_id == user_external_id)).scalar_one_or_none()
        if not user:
            return []
        profile = self.db.execute(select(UserProfile).where(UserProfile.user_id == user.id)).scalar_one_or_none()
        if not profile:
            return []
        rows = self.db.execute(
            select(ProfileDimension).where(
                ProfileDimension.user_profile_id == profile.id,
                ProfileDimension.profile_scope == "global",
                ProfileDimension.status == ACTIVE_STATUS,
                ProfileDimension.confidence >= 0.4,
            )
        ).scalars().all()
        items = [
            OnboardingDimensionBrief(
                key=row.dimension_key,
                name=row.dimension_name or DIMENSION_NAMES.get(row.dimension_key, row.dimension_key),
                label=row.label or "待观察",
                confidence=float(row.confidence or 0.0),
            )
            for row in rows
        ]
        items.sort(key=lambda item: item.confidence, reverse=True)
        return items

    def build_onboarding_system_prompt(
        self,
        round_num: int,
        current_dimensions: list[OnboardingDimensionBrief],
        history: list[OnboardingHistoryMessage],
    ) -> str:
        """组装注入 LLM 的引导模式 system prompt 片段。

        约束 LLM 严格返回结构化 JSON（user_visible / dimensions / chips），
        后端解析后：
        - user_visible 分块打字机返回给前端；
        - dimensions 直写全局画像，跳过 extractor；
        - chips 由第 2 轮起注入 onboarding_service._llm_chips。

        参数说明：
        - round_num: 当前引导轮次（1-3）
        - current_dimensions: 已获取的全局画像维度清单，LLM 不得重复抽取
        - history: 已完成的引导对话历史，非空时进入恢复模式

        返回：拼接到 system prompt 末尾的引导规则文本。
        """

        dim_text = "、".join(f"{item.name}={item.label}" for item in current_dimensions) or "暂无"
        history_note = ""
        if history:
            # 恢复模式：用户刷新页面后重新发起引导，需基于 history 推断当前轮次，避免重复提问
            history_note = (
                "\n=== 恢复模式（优先）===\n"
                "1. 用户因刷新页面重新发起引导请求，下方 onboarding_history 是本次对话已完成的轮次；\n"
                "2. 基于 history 判断当前应进入第 N 轮，不要重复提问 history 中已有的内容；\n"
                "3. 如果第 1 轮用户已回答专业，不要在第 2 轮再问专业；\n"
                "4. 以最新一条 history 的内容为准。\n"
            )
        # 第 1 轮不要求返回 chips（前端使用预设卡片），第 2 轮起要求返回 2-3 个 chips
        if round_num >= 2:
            chips_rule = (
                "chips：下一轮建议选项，返回 2-3 个；每个 payload 必须是完整自然语言句子（如\"我刚学完编程语法基础\"），"
                "严禁使用 code、缩写或 ID；icon 用单个 emoji；category 必须是已知维度名。\n"
            )
        else:
            chips_rule = "chips：第 1 轮返回空数组 []（前端使用预设卡片）。\n"
        # 第 3 轮收尾：user_visible 给收尾话术，dimensions 可空
        if round_num >= 3:
            closing_rule = (
                "本轮是最后一轮：user_visible 给收尾话术（如\"我已为你建立初步画像，现在开始学习之旅\"），"
                "dimensions 可返回空数组（已无新维度需补充）。\n"
            )
        else:
            closing_rule = ""
        return (
            "\n\n你当前处于「冷启动引导模式」，必须严格返回如下 JSON（严禁 markdown 代码块包裹，直接输出 JSON 对象）：\n"
            "{\n"
            '  "user_visible": "给用户的自然语言回复，友好简洁，1-3 句，面向大学生，不要暴露后台字段名",\n'
            '  "dimensions": [\n'
            '    {"key": "维度key", "label": "维度值标签", "confidence": 0.0到1.0的浮点}\n'
            "  ],\n"
            '  "chips": [\n'
            '    {"id": "opt_1", "label": "显示文字", "icon": "🔰", "payload": "完整自然语言句子", "category": "knowledge_base"}\n'
            "  ]\n"
            "}\n"
            "字段说明：\n"
            "user_visible：用户看到的回复，必须自然语言，围绕一个核心主题提问或确认，严禁包含 JSON 字段名或技术细节。\n"
            "dimensions：从用户本轮回答中抽取的画像维度数组；key 必须是已知维度名"
            "（major_background、knowledge_base、weakness、learning_goal、preferred_style、time_budget 等）；"
            "label 是抽取到的值；confidence 取 0.0-1.0。\n"
            f"{chips_rule}"
            f"已获取字段清单：{dim_text}，严禁重复抽取这些字段。\n"
            "用户主动输入的内容权重高于点击卡片的选择。\n"
            f"{closing_rule}"
            "3 轮后自动结束引导，即使维度不全。\n"
            f"{history_note}"
        )

    def assemble_metadata(
        self,
        *,
        user_external_id: str,
        round_num: int,
        user_message: str,
        history: list[OnboardingHistoryMessage],
        answer_after_round: bool,
    ) -> OnboardingMetadata:
        """组装 response.meta.onboarding。"""

        next_round = min(round_num + 1, 3) if answer_after_round else round_num
        done = answer_after_round and round_num >= 3
        chips = [] if done else self.build_chips(next_round, user_message, history)
        dimensions = self.build_current_dimensions(user_external_id)
        duplicate = self.detect_duplicate_answer(user_message, history)
        return OnboardingMetadata(
            isOnboarding=not done,
            round=next_round if not done else 3,
            suggestedChips=chips,
            done=done,
            currentDimensions=dimensions,
            duplicate=duplicate,
        )

    def apply_preset_chip(
        self,
        user_external_id: str,
        chip: ChipOption,
        round_num: int,
        history: list[OnboardingHistoryMessage],
    ) -> PresetChipSubmitResponse:
        """预设 chip 直写：不走 LLM，直接写入画像维度 + 返回模板话术和下一轮 chips。

        参数说明：
        - user_external_id: 当前用户外部 ID，用于定位 User 与全局画像
        - chip: 被点击的预设 chip，category 作为维度 key、value 作为写入 label
        - round_num: 用户正在回答的轮次（1-3）
        - history: 已完成的引导对话历史，用于推断下一轮 chips

        返回：PresetChipSubmitResponse，包含模板话术 aiReply 与引导元数据 meta。
        """

        # 1. 构造抽取维度并直写全局画像（仅在 chip.category 有效时写入）
        dimension_key = chip.category or ""
        if dimension_key:
            extracted_dim = ExtractedDimension(
                dimension_key=dimension_key,
                dimension_name=DIMENSION_NAMES.get(dimension_key, dimension_key),
                score=80,
                label=(chip.value or chip.label or "待观察"),
                evidence=chip.payload,
                confidence=0.88,
                method="preset_chip",
            )
            user = self.db.execute(
                select(User).where(User.external_id == user_external_id)
            ).scalar_one_or_none()
            if user:
                LearningProfileRepository(self.db).apply_dimensions_to_global(
                    user=user,
                    dimensions=[extracted_dim],
                    source_type="preset_chip",
                    source_id=chip.id,
                    force_confidence=0.88,
                )
                self.db.commit()

        # 2. 根据当前轮次生成下一轮模板话术
        ai_reply = self._build_preset_chip_reply(round_num=round_num, chip=chip)

        # 3. 组装引导元数据（复用 assemble_metadata，统一 round/done/chips/dimensions 逻辑）
        meta = self.assemble_metadata(
            user_external_id=user_external_id,
            round_num=round_num,
            user_message=chip.payload,
            history=history,
            answer_after_round=True,
        )

        return PresetChipSubmitResponse(aiReply=ai_reply, meta=meta)

    @staticmethod
    def _build_preset_chip_reply(*, round_num: int, chip: ChipOption) -> str:
        """根据当前轮次与 chip 内容生成模板话术。

        - round_num == 1：按 chip.value 中的专业关键词匹配第 2 轮问题
        - round_num == 2：进入第 3 轮痛点挖掘的固定话术
        - round_num == 3：返回收尾话术，引导结束
        """

        if round_num == 1:
            major_value = chip.value or chip.label or ""
            for keyword, reply in PRESET_CHIP_ROUND2_REPLY_BY_MAJOR.items():
                if keyword in major_value:
                    return reply
            return f"{major_value}很有前景！你目前相关学科基础处于哪个阶段？"
        if round_num == 2:
            return PRESET_CHIP_ROUND3_REPLY
        return CLOSING_MESSAGE

    def onboarding_answer_for_round(
        self,
        round_num: int,
        history: list[OnboardingHistoryMessage],
        llm_answer: str,
        answer_after_round: bool,
    ) -> str:
        """确定引导模式下返回给前端的 AI 文本。"""

        if answer_after_round and round_num >= 3:
            return llm_answer.strip() or CLOSING_MESSAGE
        if not llm_answer.strip():
            if answer_after_round:
                return self.build_question(min(round_num + 1, 3), history + [])
            return self.build_question(round_num, history)
        return llm_answer
