import logging

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_admin
from app.schemas.chatdoc_config import ChatdocConfigAdminView, ChatdocConfigInstanceList, ChatdocConfigUpsert
from app.schemas.chatdoc_vendor_quota import ChatdocVendorQuotaResetUsed, ChatdocVendorQuotaUpsert, ChatdocVendorQuotaView
from app.schemas.rag_integration import RagIntegrationTemplateList
from app.services.knowledge.iflytek.config_service import ChatdocConfigService
from app.services.knowledge.iflytek.vendor_quota import ChatdocVendorQuotaNotReadyError, ChatdocVendorQuotaService
from app.services.knowledge.integration_templates import list_integration_templates, normalize_template_key

router = APIRouter()
logger = logging.getLogger(__name__)


def _ensure_vendor_quota_supported(db: Session, integration_key: str) -> None:
    """校验当前接入实例是否支持讯飞 ChatDoc 套餐余量。"""
    if not ChatdocConfigService(db).supports_vendor_quota(integration_key):
        raise HTTPException(status_code=404, detail="当前接入实例不支持讯飞 ChatDoc 套餐余量")


@router.get("/rag-integration/templates", response_model=RagIntegrationTemplateList)
async def list_rag_integration_templates(current_user: CurrentUser = Depends(require_admin)) -> RagIntegrationTemplateList:
    """返回可接入的 RAG 集成模板列表。"""
    return RagIntegrationTemplateList.model_validate(list_integration_templates())


@router.get("/chatdoc-config/vendor-quota", response_model=ChatdocVendorQuotaView)
async def get_chatdoc_vendor_quota(
    template_key: str = Query(..., min_length=1),
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ChatdocVendorQuotaView:
    """返回指定 ChatDoc 接入实例的套餐余量视图。"""
    try:
        key = normalize_template_key(template_key)
        _ensure_vendor_quota_supported(db, key)
        return ChatdocVendorQuotaView.model_validate(ChatdocVendorQuotaService(db).get_view(key))
    except ChatdocVendorQuotaNotReadyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.put("/chatdoc-config/vendor-quota", response_model=ChatdocVendorQuotaView)
async def update_chatdoc_vendor_quota(
    payload: ChatdocVendorQuotaUpsert,
    template_key: str = Query(..., min_length=1),
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ChatdocVendorQuotaView:
    """更新指定 ChatDoc 接入实例的套餐额度。"""
    try:
        key = normalize_template_key(template_key)
        _ensure_vendor_quota_supported(db, key)
        return ChatdocVendorQuotaView.model_validate(
            ChatdocVendorQuotaService(db).upsert_limits(
                payload,
                actor_external_id=current_user.id,
                integration_key=key,
            )
        )
    except ChatdocVendorQuotaNotReadyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/chatdoc-config/vendor-quota/reset-used", response_model=ChatdocVendorQuotaView)
async def reset_chatdoc_vendor_quota_used(
    payload: ChatdocVendorQuotaResetUsed,
    template_key: str = Query(..., min_length=1),
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ChatdocVendorQuotaView:
    """重置指定 ChatDoc 接入实例的套餐已用量。"""
    try:
        key = normalize_template_key(template_key)
        _ensure_vendor_quota_supported(db, key)
        return ChatdocVendorQuotaView.model_validate(
            ChatdocVendorQuotaService(db).reset_used(
                payload,
                actor_external_id=current_user.id,
                integration_key=key,
            )
        )
    except ChatdocVendorQuotaNotReadyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/chatdoc-config/instances", response_model=ChatdocConfigInstanceList)
async def list_chatdoc_config_instances(
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ChatdocConfigInstanceList:
    """返回已登记到网关中心的 ChatDoc 接入实例。"""
    return ChatdocConfigInstanceList.model_validate(ChatdocConfigService(db).list_gateway_instances())


@router.post("/chatdoc-config/register", response_model=ChatdocConfigAdminView)
async def register_chatdoc_config(
    template_key: str = Query(..., min_length=1),
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ChatdocConfigAdminView:
    """把指定 RAG 模板登记为 ChatDoc 接入实例。"""
    try:
        return ChatdocConfigAdminView.model_validate(
            ChatdocConfigService(db).register_gateway_integration(
                template_key,
                actor_external_id=current_user.id,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/chatdoc-config", response_model=ChatdocConfigAdminView)
async def get_chatdoc_config(
    template_key: str | None = Query(default=None),
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ChatdocConfigAdminView:
    """返回 ChatDoc 接入实例的管理视图。"""
    return ChatdocConfigAdminView.model_validate(ChatdocConfigService(db).get_admin_view(template_key))


@router.put("/chatdoc-config", response_model=ChatdocConfigAdminView)
async def update_chatdoc_config(
    payload: ChatdocConfigUpsert,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ChatdocConfigAdminView:
    """保存 ChatDoc 接入实例配置。"""
    try:
        return ChatdocConfigAdminView.model_validate(
            ChatdocConfigService(db).upsert(payload, actor_external_id=current_user.id)
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/chatdoc-config", response_model=ChatdocConfigAdminView)
async def delete_chatdoc_config(
    template_key: str = Query(..., min_length=1),
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ChatdocConfigAdminView:
    """删除 ChatDoc 接入实例配置。"""
    try:
        return ChatdocConfigAdminView.model_validate(
            ChatdocConfigService(db).delete_config(template_key, actor_external_id=current_user.id)
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/chatdoc-config/test", response_model=ChatdocConfigAdminView)
async def test_chatdoc_config(
    template_key: str | None = Query(default=None),
    payload: ChatdocConfigUpsert | None = Body(default=None),
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ChatdocConfigAdminView:
    """测试 ChatDoc 接入实例连接。"""
    service = ChatdocConfigService(db)
    try:
        return ChatdocConfigAdminView.model_validate(
            await service.test_connection(
                actor_external_id=current_user.id,
                template_key=template_key,
                draft=payload,
            )
        )
    except Exception as exc:
        db.rollback()
        key = template_key or (payload.integration_key if payload else None) or "unknown"
        logger.warning("ChatDoc 连接测试路由兜底失败响应：template_key=%s", key, exc_info=True)
        return ChatdocConfigAdminView.model_validate(
            service.build_test_failure_payload(
                key,
                str(exc).strip() or "连接测试失败",
                actor_external_id=current_user.id,
                persist=False,
            )
        )
