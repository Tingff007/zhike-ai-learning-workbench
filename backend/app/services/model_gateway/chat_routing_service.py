from __future__ import annotations

import logging
from collections.abc import Callable

from app.services.model_gateway.errors import ChatProviderConfigError
from app.services.model_gateway.runtime_types import GatewayProviderConfig


logger = logging.getLogger(__name__)

CapabilityConfigLoader = Callable[[str], list[GatewayProviderConfig]]
ProviderConfigSelector = Callable[[str, str | None], GatewayProviderConfig | None]
ProviderHealthSkipper = Callable[[GatewayProviderConfig], bool]


class ModelGatewayChatRoutingService:
    """封装聊天供应商候选链、回退链和调用前配置校验。"""

    def __init__(
        self,
        *,
        configs_for_capability: CapabilityConfigLoader,
        select_provider_config: ProviderConfigSelector,
        is_provider_unhealthy_for_routing: ProviderHealthSkipper,
    ) -> None:
        """初始化聊天路由服务。

        参数:
            configs_for_capability: 按能力加载可用供应商配置的回调。
            select_provider_config: 选择显式或默认供应商配置的回调。
            is_provider_unhealthy_for_routing: 判断供应商是否需从路由链跳过的回调。
        """

        self._configs_for_capability = configs_for_capability
        self._select_provider_config = select_provider_config
        self._is_provider_unhealthy_for_routing = is_provider_unhealthy_for_routing

    def chat_provider_chain(self, provider_code: str | None = None) -> list[GatewayProviderConfig]:
        """根据显式供应商、默认优先级和回退配置生成聊天路由链。"""

        configs: list[GatewayProviderConfig] = []
        configured = self._configs_for_capability("chat")
        if provider_code:
            selected = self._select_provider_config("chat", provider_code)
            if selected:
                configs.append(selected)
                configs.extend(self.fallback_chain_for(selected, configured))
            for config in configured:
                if config.provider not in {item.provider for item in configs}:
                    configs.append(config)
        else:
            if configured:
                configs.append(configured[0])
                configs.extend(self.fallback_chain_for(configured[0], configured))
                for config in configured[1:]:
                    if config.provider not in {item.provider for item in configs}:
                        configs.append(config)
        if not configs:
            default = self._select_provider_config("chat", None)
            if default:
                configs.append(default)
        return configs

    def has_configured_chat_provider(self, provider_code: str | None = None) -> bool:
        """判断是否存在已配置密钥且可用于用户侧调用的聊天供应商。"""

        for config in self.chat_provider_chain(provider_code):
            try:
                self.validate_chat_config(config)
            except ChatProviderConfigError as exc:
                logger.debug("Chat 供应商配置不可用，跳过候选项 provider=%s: %s", config.provider, exc, exc_info=True)
                continue
            return True
        return False

    def fallback_chain_for(
        self,
        source: GatewayProviderConfig,
        available: list[GatewayProviderConfig],
    ) -> list[GatewayProviderConfig]:
        """根据来源供应商的回退列表构造可用的后备供应商链。"""

        if not source.fallback_providers:
            return []
        by_code = {config.provider: config for config in available}
        chain = [
            by_code[provider]
            for provider in source.fallback_providers
            if provider in by_code and provider != source.provider
        ]
        if source.skip_unhealthy:
            chain = [config for config in chain if not self._is_provider_unhealthy_for_routing(config)]
        return chain

    @staticmethod
    def validate_chat_config(config: GatewayProviderConfig) -> None:
        """校验聊天模型调用所需的协议和凭证配置。"""

        if config.protocol != "openai_compatible":
            raise ChatProviderConfigError(f"不支持的协议：{config.protocol}")
        if not config.api_key and config.provider != "ollama":
            raise ChatProviderConfigError("缺少 API Key")

    @staticmethod
    def is_budget_limit_error(error: str) -> bool:
        """判断模型调用异常是否由课程或供应商日额度耗尽导致。"""

        lowered = error.lower()
        return any(
            token in lowered
            for token in (
                "daily course token limit exceeded",
                "daily cost limit exceeded",
                "daily provider token limit exceeded",
            )
        )

    @staticmethod
    def format_budget_error(error: str) -> str:
        """把内部额度异常转换为用户可读的中文错误信息。"""

        lowered = error.lower()
        if "daily course token limit exceeded" in lowered:
            return "daily course token limit exceeded: 今日课程 AI Token 额度已用尽，请联系管理员调整配额"
        if "daily cost limit exceeded" in lowered:
            return "daily cost limit exceeded: 今日课程 AI 费用额度已用尽，请联系管理员调整配额"
        if "daily provider token limit exceeded" in lowered:
            return "daily provider token limit exceeded: 模型供应商日 Token 额度已用尽"
        return error
