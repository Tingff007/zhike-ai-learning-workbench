"""公开 Webhook（无需管理员 JWT），用于接收 ChatDoc 文件状态回调。"""

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.schemas.webhook import ChatdocStatusWebhookResponse
from app.services.knowledge.iflytek.chatdoc_auth import chatdoc_auth_headers
from app.services.knowledge.iflytek.client import IflytekChatDocClient
from app.services.knowledge.iflytek.webhook import handle_chatdoc_status_webhook

router = APIRouter()


def _optional_verify_chatdoc_headers(
    app_id: str | None = Header(default=None, alias="appId"),
    timestamp: str | None = Header(default=None, alias="timestamp"),
    signature: str | None = Header(default=None, alias="signature"),
) -> None:
    """按配置校验 ChatDoc 回调签名，未开启校验时直接放行。"""
    if not settings.CHATDOC_WEBHOOK_VERIFY_SIGNATURE:
        return
    if not app_id or not timestamp or not signature:
        raise HTTPException(status_code=401, detail="ChatDoc 回调鉴权头缺失")
    client = IflytekChatDocClient()
    if app_id != client.app_id:
        raise HTTPException(status_code=401, detail="ChatDoc 回调 appId 不匹配")
    try:
        ts = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="ChatDoc 回调 timestamp 无效") from exc
    expected = chatdoc_auth_headers(client.app_id, client.api_secret, timestamp=ts)
    if expected.get("signature") != signature:
        raise HTTPException(status_code=401, detail="ChatDoc 回调签名校验失败")


@router.get("/chatdoc/status", response_model=ChatdocStatusWebhookResponse)
async def chatdoc_status_webhook(
    fileId: str = Query(..., alias="fileId"),
    fileStatus: str = Query(..., alias="fileStatus"),
    db: Session = Depends(get_db),
    _: None = Depends(_optional_verify_chatdoc_headers),
) -> ChatdocStatusWebhookResponse:
    """
    处理讯飞 ChatDoc 回调：GET ?fileId=&fileStatus=。

    通过 Valkey 保证幂等，并把云端状态同步到 documents.meta_json.cloud_status。
    """
    return ChatdocStatusWebhookResponse.model_validate(
        await handle_chatdoc_status_webhook(db, file_id=fileId, file_status=fileStatus)
    )
