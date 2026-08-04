from __future__ import annotations


class ChatProviderConfigError(RuntimeError):
    """聊天供应商配置缺失或协议不支持，属于可尝试回退的候选配置错误。"""


class ModelGatewayBudgetLimitError(RuntimeError):
    """模型网关预算或额度限制错误，调用方应直接终止本次模型请求。"""
