from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from fastapi import HTTPException, status
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import encrypt_secret
from app.models import ModelCallLog, ModelProvider, UserModelOverride
from app.schemas.model_gateway import ModelProviderUpsert
from app.services.model_gateway.iflytek_compat import normalize_iflytek_spark_provider
from app.services.model_gateway.provider_config import provider_values_from_payload


class CourseBindingCleaner(Protocol):
    """课程模型绑定清理服务的最小协议。"""

    def clear_provider_bindings(self, provider_code: str) -> int:
        """清理引用指定供应商的课程绑定。"""


AuditWriter = Callable[[str | None, str, str, dict[str, Any]], None]
ProviderLoader = Callable[[str], ModelProvider | None]
ProviderHealthEnsurer = Callable[[ModelProvider], None]
CacheInvalidator = Callable[[], None]
ReloadPublisher = Callable[[str, dict[str, Any]], Awaitable[Any]]


class ModelGatewayProviderAdminService:
    """封装模型供应商的创建、更新、删除、设默认和重载通知事务。"""

    def __init__(
        self,
        db: Session,
        *,
        course_binding_service: CourseBindingCleaner,
        load_provider: ProviderLoader,
        ensure_health_row: ProviderHealthEnsurer,
        audit: AuditWriter,
        invalidate_provider_cache: CacheInvalidator,
        publish_reload_event: ReloadPublisher,
    ) -> None:
        """初始化供应商管理服务。

        参数:
            db: 当前请求范围内的数据库会话。
            course_binding_service: 课程模型绑定清理服务。
            load_provider: 按供应商编码读取数据库记录的回调。
            ensure_health_row: 确保供应商健康状态行存在的回调。
            audit: 管理操作审计写入回调。
            invalidate_provider_cache: 清理运行时供应商缓存的回调。
            publish_reload_event: 发布模型网关重载事件的回调。
        """

        self.db = db
        self._course_binding_service = course_binding_service
        self._load_provider = load_provider
        self._ensure_health_row = ensure_health_row
        self._audit = audit
        self._invalidate_provider_cache = invalidate_provider_cache
        self._publish_reload_event = publish_reload_event

    async def upsert_provider(self, payload: ModelProviderUpsert, actor_external_id: str | None = None) -> dict[str, Any]:
        """创建或更新模型供应商配置，并发布网关重载通知。"""

        provider = self._load_provider(payload.provider)
        created = provider is None
        if provider is None:
            provider = ModelProvider(provider=payload.provider, display_name=payload.display_name)
            self.db.add(provider)

        values = provider_values_from_payload(payload)
        for field, value in values.items():
            setattr(provider, field, value)
        normalize_iflytek_spark_provider(provider)
        if payload.clear_api_key:
            provider.api_key_encrypted = None
        elif payload.api_key:
            provider.api_key_encrypted = encrypt_secret(payload.api_key)

        if provider.is_default:
            self._unset_other_defaults(provider.provider, provider.provider_type)
        self.db.flush()
        self._ensure_health_row(provider)
        self._audit(
            actor_external_id,
            "model_provider.create" if created else "model_provider.update",
            provider.provider,
            self.audit_payload(payload),
        )
        self.db.commit()
        self._invalidate_provider_cache()
        await self._publish_reload_event("provider_upsert", {"provider": provider.provider})
        return {"status": "saved", "provider": provider.provider, "display_name": provider.display_name}

    async def set_default_provider(self, provider_code: str, actor_external_id: str | None = None) -> dict[str, Any]:
        """将指定模型供应商设为同类型默认供应商。"""

        provider = self._load_provider(provider_code)
        if not provider:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
        provider.is_default = True
        provider.is_active = True
        self._unset_other_defaults(provider.provider, provider.provider_type)
        self._audit(actor_external_id, "model_provider.set_default", provider.provider, {"provider_type": provider.provider_type})
        self.db.commit()
        self._invalidate_provider_cache()
        await self._publish_reload_event("provider_default", {"provider": provider.provider})
        return {"status": "saved", "provider": provider.provider, "is_default": True}

    def _unset_other_defaults(self, provider_code: str, provider_type: str) -> None:
        """取消同类供应商的默认标记，保证每类能力只有一个默认供应商。"""

        affected = ["both", provider_type]
        if provider_type == "both":
            affected = ["both", "chat", "embedding", "vision", "multimodal_embedding", "rerank", "vlm", "ocr", "image", "image_generation"]
        elif provider_type in {"image", "image_generation"}:
            affected = ["both", "image", "image_generation"]
        self.db.query(ModelProvider).filter(
            ModelProvider.provider != provider_code,
            ModelProvider.provider_type.in_(affected),
        ).update({ModelProvider.is_default: False})

    async def delete_provider(self, provider_code: str, actor_external_id: str | None = None) -> dict[str, Any]:
        """删除模型供应商，并清理相关调用日志、用户覆盖和课程绑定。"""

        provider = self._load_provider(provider_code)
        if not provider:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

        provider_id = provider.id
        provider_name = provider.provider
        display_name = provider.display_name

        deleted_logs = int(
            self.db.execute(delete(ModelCallLog).where(ModelCallLog.provider_id == provider_id)).rowcount or 0
        )
        deleted_overrides = int(
            self.db.execute(delete(UserModelOverride).where(UserModelOverride.provider == provider_name)).rowcount or 0
        )
        cleared_courses = self._course_binding_service.clear_provider_bindings(provider_name)

        self._audit(
            actor_external_id,
            "model_provider.delete",
            provider_name,
            {
                "display_name": display_name,
                "deleted_call_logs": deleted_logs,
                "deleted_user_overrides": deleted_overrides,
                "cleared_course_bindings": cleared_courses,
            },
        )
        self.db.delete(provider)
        self.db.commit()
        self._invalidate_provider_cache()
        await self._publish_reload_event("provider_delete", {"provider": provider_code})
        return {
            "status": "deleted",
            "provider": provider_code,
            "deleted_call_logs": deleted_logs,
            "deleted_user_overrides": deleted_overrides,
            "cleared_course_bindings": cleared_courses,
        }

    async def publish_reload(self, actor_external_id: str | None = None) -> dict[str, Any]:
        """手动发布模型网关重载通知。"""

        self._invalidate_provider_cache()
        self._audit(actor_external_id, "model_provider.reload", "model_gateway", {})
        self.db.commit()
        await self._publish_reload_event("manual_reload", {})
        return {"status": "reloaded", "channel": settings.MODEL_GATEWAY_RELOAD_CHANNEL}

    @staticmethod
    def audit_payload(payload: ModelProviderUpsert) -> dict[str, Any]:
        """生成审计日志使用的供应商配置摘要，并避免记录明文密钥。"""

        data = payload.model_dump(exclude={"api_key"})
        data["api_key_changed"] = bool(payload.api_key)
        return data
