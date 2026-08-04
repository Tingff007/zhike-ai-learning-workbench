from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_admin
from app.core.tracing import get_trace_id
from app.services.ai.intent.evaluator import evaluate_intent_router
from app.services.ai.intent.registry import IntentRegistryAdminService, IntentRegistryStore, IntentRegistryValidationError
from app.services.ai.intent.types import IntentEvalReport, IntentRegistryConfig, IntentRouterConfigView, RegistryValidationResult
from app.services.ai.intent_router import HybridIntentRouter

router = APIRouter()
logger = logging.getLogger(__name__)


class IntentRouterConfigPayload(BaseModel):
    """意图路由配置请求体。"""

    yaml_text: str | None = None
    config: dict[str, Any] | None = None


def _yaml_from_payload(payload: IntentRouterConfigPayload, store: IntentRegistryStore) -> str:
    """从 YAML 原文或可视化配置对象生成 YAML。"""
    if payload.yaml_text is not None:
        return payload.yaml_text
    if payload.config is None:
        raise HTTPException(status_code=422, detail="必须提供 yaml_text 或 config")
    config = IntentRegistryConfig.model_validate(payload.config)
    return store.dump_yaml(config)


def _raise_validation_error(error: IntentRegistryValidationError) -> None:
    """把 Registry 校验错误转换为 HTTP 422。"""
    raise HTTPException(status_code=422, detail=error.result.model_dump(mode="json"))


@router.get("/config", response_model=IntentRouterConfigView)
async def get_intent_router_config(
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> IntentRouterConfigView:
    """管理员读取 Intent Router 当前配置视图。"""
    return IntentRegistryAdminService(db).view(actor_external_id=current_user.id)


@router.put("/config", response_model=IntentRouterConfigView)
async def save_intent_router_config(
    payload: IntentRouterConfigPayload,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> IntentRouterConfigView:
    """管理员保存 Intent Registry 草稿。"""
    service = IntentRegistryAdminService(db)
    store = service.store
    try:
        yaml_text = _yaml_from_payload(payload, store)
        return service.save_draft(yaml_text, actor_external_id=current_user.id)
    except IntentRegistryValidationError as exc:
        service.audit_failure(current_user.id, "intent_router.config.save", "draft", str(exc))
        _raise_validation_error(exc)


@router.post("/config/validate", response_model=RegistryValidationResult)
async def validate_intent_router_config(
    payload: IntentRouterConfigPayload,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> RegistryValidationResult:
    """校验 Intent Registry YAML 或可视化配置。"""
    service = IntentRegistryAdminService(db)
    yaml_text = _yaml_from_payload(payload, service.store)
    return service.validate(yaml_text)


@router.post("/config/evaluate", response_model=IntentEvalReport)
async def evaluate_intent_router_config(
    payload: IntentRouterConfigPayload | None = None,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> IntentEvalReport:
    """运行 Intent Router 离线评测。"""
    store = IntentRegistryStore()
    if payload and (payload.yaml_text is not None or payload.config is not None):
        yaml_text = _yaml_from_payload(payload, store)
        result, config = store.validate_yaml(yaml_text)
        if not result.ok or not config:
            raise HTTPException(status_code=422, detail=result.model_dump(mode="json"))
        return evaluate_intent_router(HybridIntentRouter(registry=config), registry=config)
    config = store.load_active()
    return evaluate_intent_router(HybridIntentRouter(registry=config), registry=config)


@router.post("/config/reload", response_model=IntentRouterConfigView)
async def reload_intent_router_config(
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> IntentRouterConfigView:
    """从活跃 YAML 文件重新加载 Intent Registry。"""
    service = IntentRegistryAdminService(db)
    try:
        config = service.store.reload_from_file()
        evaluation = evaluate_intent_router(HybridIntentRouter(registry=config), registry=config)
        service.store.invalidate_cache()
        return service.reload(actor_external_id=current_user.id, evaluation=evaluation)
    except IntentRegistryValidationError as exc:
        service.audit_failure(current_user.id, "intent_router.config.reload", "active", str(exc))
        _raise_validation_error(exc)
    except Exception as exc:
        service.audit_failure(current_user.id, "intent_router.config.reload", "active", str(exc))
        logger.warning(
            "Intent Registry 重新加载失败：actor=%s action=%s trace_id=%s",
            current_user.id,
            "intent_router.config.reload",
            get_trace_id(),
            exc_info=True,
        )
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/config/publish", response_model=IntentRouterConfigView)
async def publish_intent_router_config(
    payload: IntentRouterConfigPayload | None = None,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> IntentRouterConfigView:
    """发布草稿或请求体中的 Intent Registry。"""
    service = IntentRegistryAdminService(db)
    try:
        yaml_text = _yaml_from_payload(payload, service.store) if payload else None
        if yaml_text is not None:
            result, config = service.store.validate_yaml(yaml_text)
        else:
            draft = service.store.draft_path()
            yaml_text = draft.read_text(encoding="utf-8") if draft.exists() else service.store.active_yaml_text()
            result, config = service.store.validate_yaml(yaml_text)
        if not result.ok or not config:
            raise IntentRegistryValidationError(result)
        evaluation = evaluate_intent_router(HybridIntentRouter(registry=config), registry=config)
        return service.publish(yaml_text, actor_external_id=current_user.id, evaluation=evaluation)
    except IntentRegistryValidationError as exc:
        service.audit_failure(current_user.id, "intent_router.config.publish", "active", str(exc))
        _raise_validation_error(exc)


@router.post("/config/rollback", response_model=IntentRouterConfigView)
async def rollback_intent_router_config(
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> IntentRouterConfigView:
    """回滚上一版 Intent Registry。"""
    service = IntentRegistryAdminService(db)
    try:
        service.rollback(actor_external_id=current_user.id)
        config = service.store.load_active(force=True)
        evaluation = evaluate_intent_router(HybridIntentRouter(registry=config), registry=config)
        return service.view(evaluation=evaluation, actor_external_id=current_user.id)
    except Exception as exc:
        service.audit_failure(current_user.id, "intent_router.config.rollback", "active", str(exc))
        logger.warning(
            "Intent Registry 回滚失败：actor=%s action=%s trace_id=%s",
            current_user.id,
            "intent_router.config.rollback",
            get_trace_id(),
            exc_info=True,
        )
        if isinstance(exc, IntentRegistryValidationError):
            _raise_validation_error(exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/config/export", response_model=None)
async def export_intent_router_config(
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> PlainTextResponse:
    """导出当前有效 Intent Registry YAML。"""
    yaml_text = IntentRegistryAdminService(db).export_yaml(actor_external_id=current_user.id)
    headers = {"Content-Disposition": 'attachment; filename="intent_registry.yaml"'}
    return PlainTextResponse(yaml_text, media_type="application/x-yaml; charset=utf-8", headers=headers)


@router.post("/config/import", response_model=IntentRouterConfigView)
async def import_intent_router_config(
    file: UploadFile | None = File(default=None),
    yaml_text: str | None = Form(default=None),
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> IntentRouterConfigView:
    """导入 Intent Registry YAML 为草稿。"""
    service = IntentRegistryAdminService(db)
    try:
        if file is not None:
            raw = (await file.read()).decode("utf-8")
        else:
            raw = yaml_text or ""
        if not raw.strip():
            raise HTTPException(status_code=422, detail="导入内容不能为空")
        return service.import_yaml(raw, actor_external_id=current_user.id)
    except IntentRegistryValidationError as exc:
        service.audit_failure(current_user.id, "intent_router.config.import", "draft", str(exc))
        _raise_validation_error(exc)
