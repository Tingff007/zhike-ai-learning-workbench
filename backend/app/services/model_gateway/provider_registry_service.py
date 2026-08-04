from __future__ import annotations

import time
from collections.abc import Mapping, Sequence
from typing import Any, ClassVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ModelProvider, ModelProviderHealth
from app.services.model_gateway.provider_listing import format_provider_list_item, masked_provider_api_key_hint
from app.services.model_gateway.provider_runtime import (
    build_env_default_config,
    provider_api_key_source,
    provider_has_api_key,
    provider_to_runtime_config,
)
from app.services.model_gateway.provider_selection import (
    build_provider_rows_statement,
    filter_configs_for_capability,
    provider_types_for_capability,
)
from app.services.model_gateway.runtime_types import GatewayProviderConfig


class ModelGatewayProviderRegistryService:
    """封装模型网关运行时供应商查询、缓存、能力筛选和列表格式化。"""

    _provider_cache: ClassVar[tuple[float, list[GatewayProviderConfig]] | None] = None

    def __init__(
        self,
        db: Session,
        *,
        env_key_candidates: Mapping[str, Sequence[str]],
    ) -> None:
        """初始化运行时供应商注册服务。

        参数:
            db: 当前请求范围内的数据库会话。
            env_key_candidates: 供应商编码到环境变量候选名的映射。
        """

        self.db = db
        self._env_key_candidates = env_key_candidates

    @classmethod
    def invalidate_cache(cls) -> None:
        """清空跨实例运行时供应商缓存。"""

        cls._provider_cache = None

    def list_providers(self, capability: str = "all") -> dict[str, Any]:
        """按能力类型列出模型供应商及其健康状态。"""

        providers = self.provider_rows(capability=capability, active_only=False)
        health_rows = {
            str(row.provider_id): row
            for row in self.db.execute(select(ModelProviderHealth)).scalars().all()
        }
        return {
            "items": [
                self.provider_item(provider, health_rows.get(str(provider.id)))
                for provider in providers
            ]
        }

    def provider_rows(self, capability: str = "all", active_only: bool = True) -> list[ModelProvider]:
        """按能力和启用状态查询供应商数据库记录。"""

        stmt = build_provider_rows_statement(capability=capability, active_only=active_only)
        return self.db.execute(stmt).scalars().all()

    def provider_by_code(self, provider_code: str) -> ModelProvider | None:
        """按供应商编码查询单条供应商记录。"""

        return self.db.execute(select(ModelProvider).where(ModelProvider.provider == provider_code)).scalar_one_or_none()

    def configs_for_capability(self, capability: str) -> list[GatewayProviderConfig]:
        """从缓存或数据库中筛选指定能力可用的运行时供应商配置。"""

        now = time.monotonic()
        if (
            self.__class__._provider_cache
            and now - self.__class__._provider_cache[0] < settings.MODEL_GATEWAY_CACHE_TTL_SECONDS
        ):
            cached = self.__class__._provider_cache[1]
        else:
            cached = [self.to_config(provider) for provider in self.provider_rows("all", active_only=True)]
            self.__class__._provider_cache = (now, cached)
        return filter_configs_for_capability(cached, capability)

    def select_provider_config(self, capability: str, provider_code: str | None = None) -> GatewayProviderConfig | None:
        """选择显式指定或默认优先级最高的供应商运行时配置。"""

        if provider_code:
            provider = self.provider_by_code(provider_code)
            if not provider or not provider.is_active:
                return None
            config = self.to_config(provider)
            if config.provider_type not in {*provider_types_for_capability(capability), "both"}:
                return None
            return config
        configs = self.configs_for_capability(capability)
        if configs:
            return configs[0]
        default = self.provider_by_code(settings.DEFAULT_MODEL_PROVIDER)
        return self.to_config(default) if default else None

    def to_config(self, provider: ModelProvider) -> GatewayProviderConfig:
        """将数据库供应商记录转换为运行时调用配置。"""

        return provider_to_runtime_config(provider, self._env_key_candidates)

    @staticmethod
    def env_default_config() -> GatewayProviderConfig:
        """构造仅依赖环境变量的默认供应商配置，用于数据库缺省时兜底。"""

        return build_env_default_config()

    def api_key_source(self, provider: ModelProvider) -> tuple[str | None, str]:
        """按环境变量、特殊本地供应商和数据库密文顺序解析 API Key 来源。"""

        return provider_api_key_source(provider, self._env_key_candidates)

    def has_api_key(self, provider: ModelProvider) -> bool:
        """判断供应商是否具备可用于调用的 API Key 或本地免密条件。"""

        return provider_has_api_key(provider, self._env_key_candidates)

    def provider_item(self, provider: ModelProvider, health: ModelProviderHealth | None) -> dict[str, Any]:
        """将供应商记录和健康状态格式化为管理端列表项。"""

        api_key, key_source = self.api_key_source(provider)
        return format_provider_list_item(provider=provider, health=health, api_key=api_key, key_source=key_source)

    def masked_api_key_hint(self, provider_code: str) -> str:
        """返回供应商环境变量 API Key 的脱敏提示。"""

        return self.masked_api_key_hint_for_provider(provider_code, self._env_key_candidates)

    @staticmethod
    def masked_api_key_hint_for_provider(
        provider_code: str,
        env_key_candidates: Mapping[str, Sequence[str]],
    ) -> str:
        """根据供应商环境变量候选集返回 API Key 脱敏提示。"""

        return masked_provider_api_key_hint(provider_code, env_key_candidates)

    @staticmethod
    def provider_types_for_capability(capability: str) -> set[str]:
        """把能力名称映射为可兼容的供应商类型集合。"""

        return provider_types_for_capability(capability)
