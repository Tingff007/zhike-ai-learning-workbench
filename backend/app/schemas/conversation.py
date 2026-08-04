from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, Field


class HistoryItemDTO(BaseModel):
    """侧边栏历史会话列表中的单个会话摘要。"""

    conversation_id: str = Field(..., description="会话唯一全局锁ID，对应Zustand核心路由键")
    title: str = Field(..., description="经过清洗或AI自动生成的会话摘要标题")
    updated_at: datetime = Field(..., description="最后一次对话交互的绝对时间戳，用于前端做智能时间轴归组")
    first_message_snippet: str | None = Field(None, description="首句文本缩略，供Hover显示Tooltip描述")


class CourseHistoryResponse(BaseModel):
    """按时间区段分组的课程会话历史响应。"""

    course_id: str = Field(..., description="强隔离当前的课程上下文ID")
    today_items: list[HistoryItemDTO] = Field(default_factory=list, description="今天时间区段的会话列表")
    yesterday_items: list[HistoryItemDTO] = Field(default_factory=list, description="昨天时间区段的会话列表")
    older_items: list[HistoryItemDTO] = Field(default_factory=list, description="更早历史区段的会话列表")


class ConversationRenameRequest(BaseModel):
    """重命名会话标题的请求体。"""

    title: str = Field(..., min_length=1, max_length=255)


class ConversationRenameResponse(BaseModel):
    """会话重命名成功后的最新标题响应。"""

    id: str
    title: str


class ConversationDeleteResponse(BaseModel):
    """会话删除成功后的状态响应。"""

    status: str = "deleted"
    conversation_id: str


class ConversationMessageDTO(BaseModel):
    """会话详情页展示的单条消息内容和引用元数据。"""

    id: str
    role: str
    content: str
    created_at: datetime
    meta_json: dict = Field(default_factory=dict)
    citations: list[dict] = Field(default_factory=list)


class ConversationMessagesResponse(BaseModel):
    """指定会话下的消息列表响应。"""

    conversation_id: str
    messages: list[ConversationMessageDTO] = Field(default_factory=list)
