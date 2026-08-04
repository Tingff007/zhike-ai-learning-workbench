from __future__ import annotations

import importlib
import logging
import math
from collections import defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.core.config import settings
from app.schemas.ai import AiMessageRequest
from app.services.ai.intent.rules import normalize_text
from app.services.ai.intent.types import IntentCandidate, IntentDefinition, IntentRegistryConfig, IntentType


logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class _EmbeddingBundle:
    """一次 ModelGateway embedding 调用返回的查询向量和意图样例向量。"""

    query_vector: list[float]
    grouped_vectors: dict[IntentType, list[list[float]]]


@dataclass(frozen=True, slots=True)
class _SemanticRouterSymbols:
    """延迟导入的 semantic-router 运行时符号。"""

    route_cls: type[Any]
    router_cls: type[Any]
    local_index_cls: type[Any]
    dense_encoder_cls: type[Any]


class SemanticRouterProvider:
    """Intent Registry 语义候选 Provider，优先使用 semantic-router 内核。"""

    def __init__(self, registry: IntentRegistryConfig) -> None:
        self.registry = registry
        self.semantic_router_available = self._load_semantic_router_symbols() is not None

    async def classify_async(self, payload: AiMessageRequest, db: Session | None) -> tuple[IntentCandidate, ...]:
        """异步返回语义候选意图。"""
        if settings.INTENT_ROUTER_EMBEDDING_ENABLED and db is not None:
            candidates = await self._classify_by_semantic_router(payload, db)
            if candidates:
                return candidates
            candidates = await self._classify_by_model_gateway_embedding(payload, db)
            if candidates:
                return candidates
        return self.classify_local(payload.message)

    def classify_local(self, text: str) -> tuple[IntentCandidate, ...]:
        """无外部 embedding 时使用 Registry 样例做轻量相似度兜底。"""
        message = normalize_text(text)
        if not message:
            return ()

        candidates: list[IntentCandidate] = []
        for definition in self.registry.enabled_intents():
            examples = tuple(self._examples_for_intent(definition))
            if not examples:
                continue
            score = max(self._text_similarity(message, normalize_text(example)) for example in examples)
            penalty = self._negative_penalty(definition, message)
            adjusted = max(0.0, score - penalty)
            if adjusted <= 0:
                continue
            candidates.append(
                IntentCandidate(
                    definition.name,
                    round(adjusted, 4),
                    "small_model",
                    f"Intent Registry 轻量相似度匹配 {definition.name}",
                )
            )
        return tuple(sorted(candidates, key=lambda item: item.score, reverse=True))

    async def _classify_by_model_gateway_embedding(
        self,
        payload: AiMessageRequest,
        db: Session,
    ) -> tuple[IntentCandidate, ...]:
        """通过 ModelGateway 的 EmbeddingProvider 计算样例相似度。"""
        grouped_texts = self._grouped_examples()
        if not grouped_texts:
            return ()
        bundle = await self._embedding_vectors_from_model_gateway(payload, db, grouped_texts)
        if not bundle:
            return ()

        candidates: list[IntentCandidate] = []
        for intent, intent_vectors in bundle.grouped_vectors.items():
            score = max(self._dense_cosine(bundle.query_vector, vector) for vector in intent_vectors)
            candidates.append(
                IntentCandidate(
                    intent,
                    round(score, 4),
                    "embedding",
                    f"ModelGateway EmbeddingProvider 余弦相似度匹配 {intent}",
                )
            )
        logger.debug("semantic-router 不可用或未返回候选，已回退到 ModelGateway embedding 余弦相似度")
        return tuple(sorted(candidates, key=lambda item: item.score, reverse=True))

    async def _classify_by_semantic_router(
        self,
        payload: AiMessageRequest,
        db: Session,
    ) -> tuple[IntentCandidate, ...]:
        """通过 semantic-router 内核召回意图候选，向量仍由 ModelGateway 提供。"""
        symbols = self._load_semantic_router_symbols()
        if not symbols:
            return ()

        grouped_texts = self._grouped_examples()
        if not grouped_texts:
            return ()

        bundle = await self._embedding_vectors_from_model_gateway(payload, db, grouped_texts)
        if not bundle:
            return ()

        try:
            routes = self._semantic_routes(symbols, grouped_texts)
            index = self._semantic_index(symbols, grouped_texts, bundle.grouped_vectors)
            router = self._semantic_router(symbols, routes, index, route_count=len(grouped_texts))
            raw_choices = self._semantic_route_choices(router, bundle.query_vector, limit=len(grouped_texts))
            candidates = self._semantic_choices_to_candidates(raw_choices)
            if candidates:
                logger.info(
                    "semantic-router 已返回 IntentRouter 语义候选",
                    extra={
                        "intent_router_provider": "semantic-router",
                        "intent_router_sources": [candidate.source for candidate in candidates[:3]],
                    },
                )
                return candidates
        except Exception:
            logger.warning(
                "semantic-router 候选召回失败，回退到 ModelGateway embedding 余弦相似度：course_id=%s",
                payload.course_id,
                exc_info=True,
            )
        return ()

    async def _embedding_vectors_from_model_gateway(
        self,
        payload: AiMessageRequest,
        db: Session,
        grouped_texts: dict[IntentType, list[str]],
    ) -> _EmbeddingBundle | None:
        """通过 ModelGateway 云端 EmbeddingProvider 生成查询和样例向量。"""
        try:
            from app.services.model_gateway.embeddings_api import call_embedding_api
            from app.services.model_gateway.router import ModelGateway
        except Exception:
            logger.debug("加载 ModelGateway embedding 能力失败，准备降级到本地轻量相似度。", exc_info=True)
            return None

        config = None
        try:
            gateway = ModelGateway(db)
            config = next(iter(gateway.embedding_provider_configs()), None)
            if not config or not config.embedding_model:
                return None

            texts = [payload.message]
            for examples in grouped_texts.values():
                texts.extend(examples)
            vectors = await call_embedding_api(
                protocol=config.protocol,
                base_url=config.base_url,
                api_key=config.api_key,
                model=config.embedding_model,
                texts=texts,
                provider_meta=config.meta_json,
            )
            if len(vectors) != len(texts):
                logger.warning(
                    "ModelGateway embedding 返回向量数量不匹配，准备降级到本地轻量相似度：course_id=%s provider=%s embedding_model=%s expected=%s actual=%s",
                    payload.course_id,
                    config.provider,
                    config.embedding_model,
                    len(texts),
                    len(vectors),
                )
                return None

            query_vector = vectors[0]
            offset = 1
            grouped_vectors: dict[IntentType, list[list[float]]] = defaultdict(list)
            for intent, examples in grouped_texts.items():
                for vector in vectors[offset : offset + len(examples)]:
                    grouped_vectors[intent].append(vector)
                offset += len(examples)

            return _EmbeddingBundle(query_vector=query_vector, grouped_vectors=dict(grouped_vectors))
        except Exception:
            logger.warning(
                "ModelGateway embedding 生成失败，准备降级到本地轻量相似度：course_id=%s grouped_intents=%s provider=%s embedding_model=%s",
                payload.course_id,
                len(grouped_texts),
                getattr(config, "provider", None),
                getattr(config, "embedding_model", None),
                exc_info=True,
            )
            return None

    def _grouped_examples(self) -> dict[IntentType, list[str]]:
        """按意图分组提取 Registry 中的语义样例。"""
        grouped_texts: dict[IntentType, list[str]] = {}
        for definition in self.registry.enabled_intents():
            examples: list[str] = []
            seen: set[str] = set()
            for example in self._examples_for_intent(definition):
                text = example.strip()
                if not text or text in seen:
                    continue
                seen.add(text)
                examples.append(text)
            if examples:
                grouped_texts[definition.name] = examples
        return grouped_texts

    def _examples_for_intent(self, definition: IntentDefinition) -> Iterable[str]:
        """从 Registry 意图定义中提取语义样例。"""
        yield from definition.utterances
        yield from definition.rules.exact_any
        yield from definition.rules.contains_any
        for group in definition.rules.contains_all:
            yield "".join(group)

    def _load_semantic_router_symbols(self) -> _SemanticRouterSymbols | None:
        """延迟加载 semantic-router，缺失或版本不兼容时返回 None。"""
        try:
            semantic_router_module = importlib.import_module("semantic_router")
            routers_module = importlib.import_module("semantic_router.routers")
            index_module = importlib.import_module("semantic_router.index")
            encoders_module = importlib.import_module("semantic_router.encoders")
        except Exception:
            logger.debug("semantic-router 依赖不可用，IntentRouter 将使用后续降级路径。", exc_info=True)
            return None

        route_cls = getattr(semantic_router_module, "Route", None)
        router_cls = getattr(routers_module, "SemanticRouter", None) or getattr(routers_module, "RouteLayer", None)
        local_index_cls = getattr(index_module, "LocalIndex", None)
        dense_encoder_cls = getattr(encoders_module, "DenseEncoder", None)
        if not route_cls or not router_cls or not local_index_cls or not dense_encoder_cls:
            return None
        return _SemanticRouterSymbols(
            route_cls=route_cls,
            router_cls=router_cls,
            local_index_cls=local_index_cls,
            dense_encoder_cls=dense_encoder_cls,
        )

    def _semantic_routes(
        self,
        symbols: _SemanticRouterSymbols,
        grouped_texts: dict[IntentType, list[str]],
    ) -> list[Any]:
        """把 Intent Registry 样例转换成 semantic-router Route。"""
        return [
            symbols.route_cls(name=str(intent), utterances=examples)
            for intent, examples in grouped_texts.items()
        ]

    def _semantic_index(
        self,
        symbols: _SemanticRouterSymbols,
        grouped_texts: dict[IntentType, list[str]],
        grouped_vectors: dict[IntentType, list[list[float]]],
    ) -> Any:
        """用 ModelGateway 预计算向量填充 semantic-router 本地索引。"""
        index = symbols.local_index_cls()
        embeddings: list[list[float]] = []
        routes: list[str] = []
        utterances: list[str] = []
        for intent, examples in grouped_texts.items():
            vectors = grouped_vectors.get(intent, [])
            for example, vector in zip(examples, vectors, strict=False):
                utterances.append(example)
                routes.append(str(intent))
                embeddings.append(vector)
        if not embeddings:
            raise RuntimeError("semantic-router 索引没有可用样例向量")
        try:
            index.add(
                embeddings=embeddings,
                routes=routes,
                utterances=utterances,
                function_schemas=[None] * len(embeddings),
                metadata_list=[{} for _ in embeddings],
            )
        except TypeError:
            index.add(embeddings=embeddings, routes=routes, utterances=utterances)
        return index

    def _semantic_router(
        self,
        symbols: _SemanticRouterSymbols,
        routes: list[Any],
        index: Any,
        *,
        route_count: int,
    ) -> Any:
        """创建 semantic-router 实例，禁用默认 encoder 初始化副作用。"""
        encoder = self._passthrough_encoder(symbols.dense_encoder_cls)
        kwargs: dict[str, Any] = {
            "encoder": encoder,
            "routes": routes,
            "index": index,
            "top_k": max(route_count * 2, 5),
            "auto_sync": None,
            "init_async_index": True,
        }
        try:
            return symbols.router_cls(**kwargs)
        except TypeError:
            kwargs.pop("init_async_index", None)
            kwargs.pop("auto_sync", None)
            return symbols.router_cls(**kwargs)

    def _passthrough_encoder(self, dense_encoder_cls: type[Any]) -> Any:
        """生成 semantic-router 所需的空 encoder，真实向量由 ModelGateway 提供。"""

        class ModelGatewayPassthroughEncoder(dense_encoder_cls):  # type: ignore[misc, valid-type]
            """semantic-router 占位 encoder；不下载、不加载任何本地模型。"""

            name: str = "model_gateway_passthrough"
            score_threshold: float | None = None

            def __call__(self, docs: list[str]) -> list[list[float]]:
                """阻止 semantic-router 绕过 ModelGateway 自行生成向量。"""
                raise RuntimeError("IntentRouter 已通过 ModelGateway 预计算 embedding")

            async def acall(self, docs: list[str]) -> list[list[float]]:
                """阻止异步路径绕过 ModelGateway 自行生成向量。"""
                return self.__call__(docs)

        return ModelGatewayPassthroughEncoder()

    @staticmethod
    def _semantic_route_choices(router: Any, query_vector: list[float], *, limit: int) -> tuple[Any, ...]:
        """调用 semantic-router 并统一返回候选列表。"""
        try:
            result = router(vector=query_vector, limit=None)
        except TypeError:
            try:
                result = router(vector=query_vector)
            except TypeError:
                result = router(query_vector)
        if result is None:
            return ()
        if isinstance(result, list | tuple):
            return tuple(result[:limit])
        return (result,)

    def _semantic_choices_to_candidates(self, raw_choices: Iterable[Any]) -> tuple[IntentCandidate, ...]:
        """把 semantic-router 返回值转换为项目内 IntentCandidate。"""
        intent_names = self.registry.intent_map()
        best_scores: dict[IntentType, float] = {}
        for choice in raw_choices:
            route_name = str(
                getattr(choice, "name", None)
                or getattr(choice, "route", None)
                or getattr(choice, "route_name", None)
                or ""
            )
            if route_name not in intent_names:
                continue
            raw_score = (
                getattr(choice, "similarity_score", None)
                if getattr(choice, "similarity_score", None) is not None
                else getattr(choice, "score", None)
            )
            try:
                score = float(raw_score)
            except (TypeError, ValueError):
                continue
            score = max(0.0, min(1.0, score))
            intent = route_name  # type: ignore[assignment]
            best_scores[intent] = max(best_scores.get(intent, 0.0), score)

        candidates = [
            IntentCandidate(
                intent,
                round(score, 4),
                "embedding",
                f"semantic-router + ModelGateway EmbeddingProvider 匹配 {intent}",
            )
            for intent, score in best_scores.items()
            if score > 0
        ]
        return tuple(sorted(candidates, key=lambda item: item.score, reverse=True))

    @staticmethod
    def _negative_penalty(definition: IntentDefinition, message: str) -> float:
        """按负例和排除规则降低误触发分数。"""
        negative_texts = list(definition.negative_utterances) + list(definition.rules.negative_contains_any)
        if any(normalize_text(item) and normalize_text(item) in message for item in negative_texts):
            return 0.35
        return 0.0

    @staticmethod
    def _text_similarity(left: str, right: str) -> float:
        """计算中文短文本的轻量相似度。"""
        if not left or not right:
            return 0.0
        if left == right:
            return 1.0
        if left in right or right in left:
            return 0.82
        left_grams = SemanticRouterProvider._char_grams(left)
        right_grams = SemanticRouterProvider._char_grams(right)
        overlap = len(left_grams & right_grams)
        union = len(left_grams | right_grams) or 1
        jaccard = overlap / union
        sequence = SequenceMatcher(a=left, b=right).ratio()
        return max(jaccard, sequence * 0.72)

    @staticmethod
    def _char_grams(text: str) -> set[str]:
        """生成短文本字符二元组。"""
        if len(text) <= 1:
            return {text}
        return {text[index : index + 2] for index in range(len(text) - 1)}

    @staticmethod
    def _dense_cosine(left: list[float], right: list[float]) -> float:
        """计算 dense embedding 的余弦相似度。"""
        numerator = sum(a * b for a, b in zip(left, right, strict=False))
        left_norm = math.sqrt(sum(value * value for value in left))
        right_norm = math.sqrt(sum(value * value for value in right))
        if left_norm == 0 or right_norm == 0:
            return 0.0
        return numerator / (left_norm * right_norm)
