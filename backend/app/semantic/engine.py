from __future__ import annotations

import hashlib
import logging
import math
import re
import threading
from functools import lru_cache
from typing import Iterable

from findbid_shared.config import get_settings


logger = logging.getLogger(__name__)
TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣+#.]+")


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return max(-1.0, min(1.0, dot / (left_norm * right_norm)))


def _fallback_embedding(text: str, dimensions: int = 384) -> list[float]:
    """모델을 준비하지 못한 경우 사용하는 문자·단어 특징 해싱 벡터."""
    normalized = " ".join(text.lower().replace("·", " ").split())
    features: list[str] = TOKEN_PATTERN.findall(normalized)
    compact = normalized.replace(" ", "")
    features.extend(
        compact[index : index + 3]
        for index in range(max(0, len(compact) - 2))
    )
    vector = [0.0] * dimensions
    for feature in features:
        digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
        bucket = int.from_bytes(digest[:4], "big") % dimensions
        sign = 1.0 if digest[4] & 1 else -1.0
        vector[bucket] += sign
    magnitude = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / magnitude for value in vector]


class SemanticSearchEngine:
    def __init__(self) -> None:
        settings = get_settings()
        self.enabled = settings.semantic_search_enabled
        self.model_name = settings.semantic_model_name
        self.minimum_score = settings.semantic_min_score
        self._model = None
        self._model_failed = False
        self._model_lock = threading.Lock()

    @property
    def engine_name(self) -> str:
        if not self.enabled:
            return "사용 안 함"
        if self._model_failed:
            return "로컬 특징 벡터 대체"
        return self.model_name

    @property
    def using_fallback(self) -> bool:
        return self._model_failed or not self.enabled

    def _load_model(self):
        if self._model is not None:
            return self._model
        if self._model_failed or not self.enabled:
            return None
        with self._model_lock:
            if self._model is not None:
                return self._model
            if self._model_failed:
                return None
            try:
                from fastembed import TextEmbedding

                self._model = TextEmbedding(
                    model_name=self.model_name,
                    cache_dir=get_settings().semantic_model_cache,
                )
            except Exception:
                self._model_failed = True
                logger.exception(
                    "문장 임베딩 모델을 준비하지 못해 로컬 특징 벡터로 대체합니다."
                )
        return self._model

    def embed(self, texts: Iterable[str]) -> list[list[float]]:
        values = list(texts)
        if not values:
            return []
        model = self._load_model()
        if model is None:
            return [_fallback_embedding(value) for value in values]
        return [
            [float(number) for number in vector]
            for vector in model.embed(values, batch_size=32)
        ]

    def score(
        self,
        query: str,
        document_vectors: dict[str, list[float]],
    ) -> dict[str, int]:
        if not query.strip() or not self.enabled:
            return {}
        query_vector = self.embed([query])[0]
        return self.score_vector(query_vector, document_vectors)

    def score_vector(
        self,
        query_vector: list[float],
        document_vectors: dict[str, list[float]],
    ) -> dict[str, int]:
        minimum_score = 0.08 if self._model_failed else self.minimum_score
        scores: dict[str, int] = {}
        for document_id, vector in document_vectors.items():
            similarity = max(0.0, cosine_similarity(query_vector, vector))
            if similarity >= minimum_score:
                scores[document_id] = round(similarity * 100)
        return scores


@lru_cache
def get_semantic_search_engine() -> SemanticSearchEngine:
    return SemanticSearchEngine()
