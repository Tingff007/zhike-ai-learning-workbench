"""IntentRouter 2.0 可插拔路由平台模块。"""

from app.services.ai.intent.registry import IntentRegistryStore
from app.services.ai.intent.types import IntentCandidate, IntentRoute, IntentType

__all__ = ["IntentCandidate", "IntentRegistryStore", "IntentRoute", "IntentType"]

