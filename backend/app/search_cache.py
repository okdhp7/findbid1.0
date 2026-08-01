from __future__ import annotations

import hashlib
import json
import logging
from functools import lru_cache
from typing import Any

from redis import Redis

from findbid_shared.config import get_settings
from findbid_shared.schemas import SearchRequest


logger = logging.getLogger(__name__)
SEARCH_ALGORITHM_VERSION = 27


@lru_cache
def _redis_client() -> Redis:
    return Redis.from_url(
        get_settings().redis_url,
        decode_responses=True,
        socket_connect_timeout=0.3,
        socket_timeout=0.7,
    )


def _cache_key(request: SearchRequest) -> str:
    values = request.model_dump(
        mode="json",
        exclude={"page", "limit"},
        by_alias=False,
    )
    settings = get_settings()
    values["semantic_model"] = settings.semantic_model_name
    values["semantic_min_score"] = settings.semantic_min_score
    values["semantic_candidate_limit"] = settings.semantic_candidate_limit
    values["search_algorithm_version"] = SEARCH_ALGORITHM_VERSION
    serialized = json.dumps(
        values,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    return f"findbid:semantic-search:{digest}"


def get_cached_semantic_search(
    request: SearchRequest,
) -> dict[str, Any] | None:
    settings = get_settings()
    if (
        not request.semantic_query.strip()
        or settings.semantic_result_cache_seconds <= 0
    ):
        return None
    try:
        value = _redis_client().get(_cache_key(request))
        return json.loads(value) if value else None
    except Exception:
        logger.warning(
            "시맨틱 검색 캐시를 읽지 못해 데이터베이스 검색을 계속합니다.",
            exc_info=True,
        )
        return None


def set_cached_semantic_search(
    request: SearchRequest,
    value: dict[str, Any],
) -> None:
    settings = get_settings()
    if (
        not request.semantic_query.strip()
        or settings.semantic_result_cache_seconds <= 0
    ):
        return
    try:
        _redis_client().setex(
            _cache_key(request),
            settings.semantic_result_cache_seconds,
            json.dumps(value, ensure_ascii=False, separators=(",", ":")),
        )
    except Exception:
        logger.warning(
            "시맨틱 검색 캐시를 저장하지 못했지만 검색 결과는 정상 반환합니다.",
            exc_info=True,
        )
