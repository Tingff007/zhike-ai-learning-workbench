from __future__ import annotations

from pydantic import BaseModel


class ChatdocStatusWebhookResponse(BaseModel):
    """讯飞 ChatDoc 状态回调处理响应。"""

    status: str
    reason: str | None = None
    file_id: str | None = None
    file_status: str | None = None
    document_id: str | None = None
    vector_status: str | None = None
    received_at: str | None = None
