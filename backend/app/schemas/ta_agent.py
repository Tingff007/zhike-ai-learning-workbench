"""助教端 AI Agent 对话的请求与响应模型。

教师端 Agent 与学习端 AI 自习室复用同一套引用/轨迹契约（Citation、AgentTraceEvent、
ChatQuality），但意图域不同：这里聚焦教师业务（班级/作业/成绩只读查询）与课程知识
问答，回答一律强制携带本地知识库引用，无依据时拒答以达成零幻觉。
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.ai import AgentTraceEvent, ChatQuality
from app.schemas.common import Citation


class TaAgentMessageRequest(BaseModel):
    """教师端 Agent 单轮对话请求。"""

    message: str = Field(..., min_length=1, max_length=4000, description="教师提问内容")
    course_id: str | None = Field(default=None, description="课程 slug 或 UUID；缺省时按教师班级归属课程解析")
    conversation_id: str | None = Field(default=None, description="会话 ID；缺省时后端新建")
    require_citations: bool | None = Field(default=None, description="是否强制要求知识库引用；缺省按意图自动决定")


class TaAgentDataFact(BaseModel):
    """业务数据工具返回的一条可核验事实，前端可展示为数据卡片。"""

    label: str = Field(..., description="事实名称，如「班级学生数」")
    value: str = Field(..., description="事实值，如「23」")
    detail: str | None = Field(default=None, description="补充说明，如来源班级/作业名称")


class TaAgentMessageResponse(BaseModel):
    """教师端 Agent 单轮对话响应。"""

    conversation_id: str
    answer: str
    citations: list[Citation] = Field(default_factory=list, description="知识库引用，零幻觉防线证据")
    data_facts: list[TaAgentDataFact] = Field(default_factory=list, description="业务数据工具返回的可核验事实")
    agent_trace: list[AgentTraceEvent] = Field(default_factory=list, description="Agent 执行步骤轨迹")
    quality: ChatQuality | None = None
    route: str = Field(default="ta_knowledge_qa", description="实际执行的意图路由")
    refused: bool = Field(default=False, description="是否因证据不足拒答（零幻觉防线触发）")
    refusal_reason: str | None = Field(default=None, description="拒答原因：no_hit / low_confidence / unsafe")
