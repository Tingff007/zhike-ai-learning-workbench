from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_admin
from app.schemas.model_gateway import (
    ModelCallLogResponse,
    ModelCallLogClearResponse,
    ModelGatewayTraceDetail,
    ModelProviderDeleteResponse,
    ModelProviderHealthResponse,
    ModelProviderIconList,
    ModelProviderIconMutationResponse,
    ModelProviderMutationResponse,
    ModelProviderReloadResponse,
    ModelProviderTemplateList,
    ModelProviderUpsert,
    ProviderCheckAllResponse,
    ProviderTestResponse,
    ProviderUsageStatsResponse,
)
from app.services.model_gateway.provider_icons import delete_icon, list_icons, save_icon_upload
from app.services.model_gateway.provider_templates import list_provider_templates
from app.services.model_gateway.router import ModelGateway

router = APIRouter()


@router.get("/templates", response_model=ModelProviderTemplateList)
async def provider_templates(current_user: CurrentUser = Depends(require_admin)) -> ModelProviderTemplateList:
    """返回模型供应商预设模板列表。"""
    return ModelProviderTemplateList.model_validate(list_provider_templates())


@router.get("/icons", response_model=ModelProviderIconList)
async def provider_icons(current_user: CurrentUser = Depends(require_admin)) -> ModelProviderIconList:
    """返回模型供应商图标库。"""
    return ModelProviderIconList(items=list_icons())


@router.post("/icons", response_model=ModelProviderIconMutationResponse)
async def upload_provider_icon(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_admin),
) -> ModelProviderIconMutationResponse:
    """上传模型供应商图标。"""
    return ModelProviderIconMutationResponse.model_validate(await save_icon_upload(file))


@router.delete("/icons/{filename}", response_model=ModelProviderIconMutationResponse)
async def remove_provider_icon(
    filename: str,
    current_user: CurrentUser = Depends(require_admin),
) -> ModelProviderIconMutationResponse:
    """删除模型供应商图标。"""
    return ModelProviderIconMutationResponse.model_validate(delete_icon(filename))


@router.get("", response_model=ModelProviderHealthResponse)
async def list_providers(
    capability: str = Query(default="all", pattern="^(all|chat|embedding|vision|image|image_generation|doc_qa|resource_agent)$"),
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ModelProviderHealthResponse:
    """返回模型供应商列表。"""
    return ModelProviderHealthResponse.model_validate(ModelGateway(db).list_providers(capability))


@router.get("/health", response_model=ModelProviderHealthResponse)
async def provider_health(
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ModelProviderHealthResponse:
    """返回模型供应商健康状态汇总。"""
    return ModelProviderHealthResponse.model_validate(ModelGateway(db).health_summary())


@router.get("/logs", response_model=ModelCallLogResponse)
async def provider_logs(
    capability: str = Query(default="all", pattern="^(all|chat|embedding|vision|image|image_generation|doc_qa|resource_agent|intent_route|intent_feedback)$"),
    provider: str | None = Query(default=None),
    status: str | None = Query(default=None, pattern="^(success|failed|fallback|degraded|clarify|correct|incorrect)$"),
    course_id: str | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=90),
    start_at: str | None = Query(default=None),
    end_at: str | None = Query(default=None),
    model_name: str | None = Query(default=None),
    trace_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ModelCallLogResponse:
    """返回模型调用日志和汇总统计。"""
    return ModelCallLogResponse.model_validate(
        ModelGateway(db).call_logs(
            capability=capability,
            provider=provider,
            status=status,
            course_id=course_id,
            days=days,
            start_at=start_at,
            end_at=end_at,
            model_name=model_name,
            trace_id=trace_id,
            limit=limit,
        )
    )


@router.delete("/logs", response_model=ModelCallLogClearResponse)
async def clear_provider_logs(
    capability: str = Query(default="all", pattern="^(all|chat|embedding|vision|image|image_generation|doc_qa|resource_agent|intent_route|intent_feedback)$"),
    provider: str | None = Query(default=None),
    status: str | None = Query(default=None, pattern="^(success|failed|fallback|degraded|clarify|correct|incorrect)$"),
    course_id: str | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=90),
    start_at: str | None = Query(default=None),
    end_at: str | None = Query(default=None),
    model_name: str | None = Query(default=None),
    trace_id: str | None = Query(default=None),
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ModelCallLogClearResponse:
    """按筛选条件清理模型调用日志。"""
    return ModelCallLogClearResponse.model_validate(
        await ModelGateway(db).clear_call_logs(
            capability=capability,
            provider=provider,
            status=status,
            course_id=course_id,
            days=days,
            start_at=start_at,
            end_at=end_at,
            model_name=model_name,
            trace_id=trace_id,
            actor_external_id=current_user.id,
        )
    )


@router.get("/traces/{trace_id}", response_model=ModelGatewayTraceDetail)
async def trace_detail(
    trace_id: str,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ModelGatewayTraceDetail:
    """返回指定 trace 的模型、RAG 与审计明细。"""
    return ModelGatewayTraceDetail.model_validate(ModelGateway(db).trace_detail(trace_id))


@router.post("/test", response_model=ProviderTestResponse)
async def test_provider_draft(
    payload: ModelProviderUpsert,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProviderTestResponse:
    """测试未保存或草稿状态的模型供应商配置。"""
    return ProviderTestResponse.model_validate(
        await ModelGateway(db).test_connection_draft(payload, actor_external_id=current_user.id)
    )


@router.post("", response_model=ModelProviderMutationResponse)
async def create_provider(
    payload: ModelProviderUpsert,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ModelProviderMutationResponse:
    """创建模型供应商配置。"""
    return ModelProviderMutationResponse.model_validate(
        await ModelGateway(db).upsert_provider(payload, actor_external_id=current_user.id)
    )


@router.put("/{provider_id}", response_model=ModelProviderMutationResponse)
async def update_provider(
    provider_id: str,
    payload: ModelProviderUpsert,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ModelProviderMutationResponse:
    """更新模型供应商配置。"""
    payload.provider = provider_id
    return ModelProviderMutationResponse.model_validate(
        await ModelGateway(db).upsert_provider(payload, actor_external_id=current_user.id)
    )


@router.delete("/{provider_id}", response_model=ModelProviderDeleteResponse)
async def delete_provider(
    provider_id: str,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ModelProviderDeleteResponse:
    """删除模型供应商配置，并清理相关日志和课程绑定。"""
    return ModelProviderDeleteResponse.model_validate(
        await ModelGateway(db).delete_provider(provider_id, actor_external_id=current_user.id)
    )


@router.post("/{provider_id}/test", response_model=ProviderTestResponse)
async def test_provider(
    provider_id: str,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProviderTestResponse:
    """测试已保存的模型供应商连接。"""
    return ProviderTestResponse.model_validate(
        await ModelGateway(db).test_connection(provider_id, actor_external_id=current_user.id)
    )


@router.post("/check-all", response_model=ProviderCheckAllResponse)
async def check_all_providers(
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProviderCheckAllResponse:
    """批量检查所有启用的模型供应商。"""
    return ProviderCheckAllResponse.model_validate(
        await ModelGateway(db).check_all_providers(actor_external_id=current_user.id)
    )


@router.post("/{provider_id}/default", response_model=ModelProviderMutationResponse)
async def set_default_provider(
    provider_id: str,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ModelProviderMutationResponse:
    """设置默认模型供应商。"""
    return ModelProviderMutationResponse.model_validate(
        await ModelGateway(db).set_default_provider(provider_id, actor_external_id=current_user.id)
    )


@router.post("/reload", response_model=ModelProviderReloadResponse)
async def reload_providers(
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ModelProviderReloadResponse:
    """发布模型网关配置重载事件。"""
    return ModelProviderReloadResponse.model_validate(
        await ModelGateway(db).publish_reload(actor_external_id=current_user.id)
    )


@router.get("/usage-stats", response_model=ProviderUsageStatsResponse)
async def provider_usage_stats(
    days: int = Query(default=30, ge=1, le=365),
    start_at: str | None = Query(default=None),
    end_at: str | None = Query(default=None),
    capability: str = Query(default="all", pattern="^(all|chat|embedding|vision|image|image_generation|doc_qa|resource_agent|intent_route|intent_feedback)$"),
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProviderUsageStatsResponse:
    """返回模型供应商调用用量统计。"""
    return ProviderUsageStatsResponse.model_validate(
        ModelGateway(db).usage_stats(
            days=days,
            start_at=start_at,
            end_at=end_at,
            capability=capability,
        )
    )
