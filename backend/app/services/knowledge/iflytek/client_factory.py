from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.knowledge.iflytek.client import IflytekChatDocClient
from app.services.knowledge.iflytek.config_service import ChatdocConfigService


def chatdoc_client_for_db(
    db: Session | None = None,
    *,
    integration_key: str | None = None,
) -> IflytekChatDocClient:
    """创建带数据库凭据解析能力的 ChatDoc 客户端。

    参数:
        db: 可选 SQLAlchemy 会话；为空时返回未配置凭据的客户端。
        integration_key: 可选集成配置键，用于选择指定的 ChatDoc 凭据。

    返回:
        IflytekChatDocClient 实例。

    副作用/失败:
        传入 db 时会读取集成配置；凭据缺失不会在此处抛出，会由客户端发起请求时校验。
    """
    if db is None:
        return IflytekChatDocClient()
    app_id, api_secret = ChatdocConfigService(db).resolve_credentials(integration_key)
    return IflytekChatDocClient(app_id=app_id, api_secret=api_secret)
