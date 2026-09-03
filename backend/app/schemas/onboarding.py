"""冷启动引导向导的数据契约。"""

from __future__ import annotations

from pydantic import BaseModel, Field


class OnboardingHistoryMessage(BaseModel):
    """引导恢复用的 OpenAI 风格消息。"""

    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1)


class ChipOption(BaseModel):
    """快捷卡片选项。"""

    id: str
    label: str
    icon: str | None = None
    payload: str
    category: str | None = None
    # 预设 chip 直写画像时写入 ProfileDimension.label 的值，不填时回退到 label
    value: str | None = None
    metadata: dict[str, str] | None = None


class OnboardingDimensionBrief(BaseModel):
    """标签云使用的精简维度。"""

    key: str
    name: str
    label: str
    confidence: float = Field(ge=0.0, le=1.0)


class OnboardingMetadata(BaseModel):
    """AI 响应中携带的引导元数据。"""

    is_onboarding: bool = Field(alias="isOnboarding")
    round: int = Field(ge=1, le=3)
    suggested_chips: list[ChipOption] = Field(default_factory=list, alias="suggestedChips")
    done: bool = False
    current_dimensions: list[OnboardingDimensionBrief] = Field(default_factory=list, alias="currentDimensions")
    duplicate: bool = False

    model_config = {"populate_by_name": True}


class PresetChipSubmitRequest(BaseModel):
    """预设 chip 直写请求体：不走 LLM，后端直接写入画像维度。"""

    # 被点击的预设 chip，category 作为维度 key、value 作为写入 label
    chip: ChipOption
    # 当前引导轮次（1-3），表示用户正在回答第 round 轮
    round: int = Field(ge=1, le=3)
    # 已完成的引导对话历史，供后端定位下一轮问题与 chips
    history: list[OnboardingHistoryMessage] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class PresetChipSubmitResponse(BaseModel):
    """预设 chip 直写响应体：返回模板话术与下一轮引导元数据。"""

    # AI 的模板回复话术（前端用打字机效果展示）
    ai_reply: str = Field(alias="aiReply")
    # 引导元数据（含下一轮 chips、当前维度、轮次、是否完成）
    meta: OnboardingMetadata

    model_config = {"populate_by_name": True}
