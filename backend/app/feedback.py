from __future__ import annotations

import hashlib
import json
import logging
import re
from functools import lru_cache
from time import time
from typing import Any

from redis import Redis

from findbid_shared.config import get_settings
from findbid_shared.recommendation_versions import (
    FEEDBACK_POLICY_VERSION,
    FINGERPRINT_SCHEMA_VERSION,
    RANKING_MODEL_VERSION,
    recommendation_versions,
)
from findbid_shared.schemas import BidRecord, FeedbackRequest, SearchRequest


logger = logging.getLogger(__name__)
SESSION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,80}$")
FEEDBACK_REASONS = {
    "검색 주제와 다름",
    "업무 구분이 다름",
    "지역이 맞지 않음",
    "사업금액이 맞지 않음",
    "계약방법이 맞지 않음",
    "수요기관이 맞지 않음",
    "회사 역량과 맞지 않음",
    "이미 확인한 공고",
    "기타",
}


def normalize_session_id(value: str) -> str:
    value = value.strip()
    return value if SESSION_ID_PATTERN.fullmatch(value) else ""


def search_fingerprint(request: SearchRequest) -> str:
    values = request.model_dump(
        mode="json",
        exclude={"page", "limit", "search_trigger"},
        by_alias=False,
    )
    values["fingerprint_schema_version"] = FINGERPRINT_SCHEMA_VERSION
    serialized = json.dumps(
        values,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:24]


def _record_features(record: BidRecord) -> dict[str, Any]:
    return {
        "title": record.title,
        "category": record.category,
        "region": record.region,
        "contractMethod": record.contract_method,
        "demandAgency": record.demand_agency,
        "budget": record.budget,
        "score": record.score,
        "scoreConfidence": record.score_confidence,
        "eligibility": record.eligibility,
        "tags": record.tags[:12],
    }


def _same_budget_band(left: int, right: int) -> bool:
    if left <= 0 or right <= 0:
        return False
    return abs(left - right) <= max(100_000_000, round(max(left, right) * 0.35))


def _condition_matches_record(
    record: BidRecord,
    condition: dict[str, Any],
) -> bool:
    kind = str(condition.get("kind", ""))
    value = str(condition.get("value", "")).strip().lower()
    if not value:
        return False
    if kind == "category":
        return record.category.lower() == value
    if kind == "region":
        return record.region.lower() == value
    if kind == "contract_method":
        return value in record.contract_method.lower()
    if kind == "demand_agency":
        return value in record.demand_agency.lower()
    if kind != "semantic":
        return False

    variants = condition.get("variants")
    normalized_variants = (
        [
            str(variant).strip().lower()
            for variant in variants
            if str(variant).strip()
        ]
        if isinstance(variants, list)
        else [value]
    )
    corpus = " ".join(
        [
            record.title,
            record.summary,
            record.category,
            *record.tags,
            *record.matched,
            *record.matched_conditions,
        ]
    ).lower()
    return any(variant in corpus for variant in normalized_variants)


def apply_feedback_adjustments(
    records: list[BidRecord],
    feedback: dict[str, dict[str, Any]],
    adjustment_limit: int,
) -> tuple[list[BidRecord], bool]:
    if not feedback:
        return records, False

    adjusted: list[BidRecord] = []
    for record in records:
        direct = feedback.get(record.id)
        if direct and direct.get("type") == "exclude":
            continue

        adjustment = 0
        for feedback_bid_id, item in feedback.items():
            feedback_type = str(item.get("type", ""))
            feedback_source = str(item.get("source", "detail"))
            if feedback_type not in {"positive", "negative", "exclude"}:
                continue
            if feedback_bid_id == record.id:
                if feedback_type == "positive":
                    adjustment += 3 if feedback_source == "favorite" else 5
                else:
                    adjustment -= 6
                continue
            if feedback_type == "exclude":
                continue

            sign = 1 if feedback_type == "positive" else -1
            stored_reasons = item.get("reasons")
            reasons = (
                [
                    str(reason).strip()
                    for reason in stored_reasons
                    if str(reason).strip()
                ]
                if isinstance(stored_reasons, list)
                else [str(item.get("reason", "")).strip()]
            )
            if not reasons:
                reasons = [str(item.get("reason", "")).strip()]
            features = item.get("features")
            if not isinstance(features, dict):
                continue

            if feedback_source == "favorite":
                feature_tags = {
                    str(tag).strip().lower()
                    for tag in features.get("tags", [])
                    if str(tag).strip()
                }
                record_tags = {tag.strip().lower() for tag in record.tags if tag.strip()}
                if (
                    record.category == features.get("category")
                    and feature_tags.intersection(record_tags)
                ):
                    adjustment += 1
                continue

            feature_tags = {
                str(tag).strip().lower()
                for tag in features.get("tags", [])
                if str(tag).strip()
            }
            record_tags = {tag.strip().lower() for tag in record.tags if tag.strip()}
            stored_conditions = item.get("conditions")
            feedback_conditions = (
                [
                    condition
                    for condition in stored_conditions
                    if isinstance(condition, dict)
                ]
                if isinstance(stored_conditions, list)
                else []
            )
            topic_condition_applied = False
            for condition in feedback_conditions:
                if (
                    condition.get("kind") != "semantic"
                    or not _condition_matches_record(record, condition)
                ):
                    continue
                mode = str(condition.get("mode", "boost"))
                condition_weight = 2 if mode in {"must", "should"} else 1
                adjustment += condition_weight * sign
                topic_condition_applied = True

            for reason in reasons:
                if reason == "이미 확인한 공고":
                    continue
                if reason == "검색 주제와 다름" and topic_condition_applied:
                    continue
                if reason == "업무 구분이 다름":
                    if record.category == features.get("category"):
                        adjustment += 2 * sign
                    continue
                if reason == "계약방법이 맞지 않음":
                    if record.contract_method == features.get("contractMethod"):
                        adjustment += 2 * sign
                    continue
                if reason == "수요기관이 맞지 않음":
                    if record.demand_agency == features.get("demandAgency"):
                        adjustment += 2 * sign
                    continue
                if reason == "지역이 맞지 않음":
                    if record.region == features.get("region"):
                        adjustment += 2 * sign
                    continue
                if reason == "사업금액이 맞지 않음":
                    if _same_budget_band(record.budget, int(features.get("budget") or 0)):
                        adjustment += 2 * sign
                    continue

                if feature_tags.intersection(record_tags):
                    adjustment += 2 * sign
                if record.category == features.get("category"):
                    adjustment += sign
                if (
                    feedback_type == "positive"
                    and record.contract_method == features.get("contractMethod")
                ):
                    adjustment += sign

        adjustment = max(-adjustment_limit, min(adjustment_limit, adjustment))
        adjusted.append(
            record.model_copy(
                update={
                    "score": max(0, min(100, record.score + adjustment)),
                    "feedback_adjustment": adjustment,
                    "session_feedback": (
                        str(direct.get("type"))
                        if direct
                        else None
                    ),
                    "session_feedback_source": (
                        str(direct.get("source", "detail"))
                        if direct
                        else None
                    ),
                }
            )
        )

    adjusted.sort(key=lambda item: (-item.score, item.days_left, item.id))
    return adjusted, True


class FeedbackStore:
    def __init__(self, redis_client: Redis | None = None):
        self.redis = redis_client or feedback_redis_client()
        self.settings = get_settings()

    @property
    def ttl(self) -> int:
        return max(300, self.settings.feedback_session_ttl_seconds)

    @staticmethod
    def _namespace() -> str:
        return (
            f"findbid:feedback:v{FEEDBACK_POLICY_VERSION}:"
            f"fp{FINGERPRINT_SCHEMA_VERSION}:{RANKING_MODEL_VERSION}"
        )

    def _impression_key(self, session_id: str, search_id: str) -> str:
        return f"{self._namespace()}:impression:{session_id}:{search_id}"

    def _feedback_key(self, session_id: str, fingerprint: str) -> str:
        return f"{self._namespace()}:items:{session_id}:{fingerprint}"

    def _active_sessions_key(self) -> str:
        return f"{self._namespace()}:active-sessions"

    @staticmethod
    def _settings_key() -> str:
        return "findbid:recommendation:settings"

    def is_enabled(self) -> bool:
        try:
            value = self.redis.hget(self._settings_key(), "feedbackEnabled")
            return value != "0"
        except Exception:
            logger.warning(
                "추천 피드백 설정을 읽지 못해 기본값을 사용합니다.",
                exc_info=True,
            )
            return True

    def set_enabled(self, enabled: bool) -> bool:
        try:
            self.redis.hset(
                self._settings_key(),
                "feedbackEnabled",
                "1" if enabled else "0",
            )
            return enabled
        except Exception as error:
            logger.warning("추천 피드백 설정 저장에 실패했습니다.", exc_info=True)
            raise RuntimeError("추천 피드백 설정을 저장하지 못했습니다.") from error

    def touch_session(self, session_id: str) -> None:
        session_id = normalize_session_id(session_id)
        if not session_id:
            return
        now = int(time())
        self.redis.zadd(self._active_sessions_key(), {session_id: now})
        self.redis.expire(self._active_sessions_key(), self.ttl * 2)

    def save_impression(
        self,
        session_id: str,
        search_id: str,
        fingerprint: str,
        records: list[BidRecord],
        search_conditions: list[dict[str, Any]] | None = None,
        search_request: SearchRequest | None = None,
        result_summary: dict[str, Any] | None = None,
    ) -> None:
        session_id = normalize_session_id(session_id)
        if not session_id:
            return
        try:
            payload = {
                "fingerprint": fingerprint,
                "bids": {
                    record.id: _record_features(record)
                    for record in records
                },
                "conditions": search_conditions or [],
                "request": (
                    search_request.model_dump(mode="json", by_alias=True)
                    if search_request is not None
                    else {}
                ),
                "summary": result_summary or {},
            }
            self.redis.setex(
                self._impression_key(session_id, search_id),
                self.ttl,
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            )
            self.touch_session(session_id)
        except Exception:
            logger.warning("검색 노출 세션을 저장하지 못했습니다.", exc_info=True)

    def get_feedback(
        self,
        session_id: str,
        fingerprint: str,
    ) -> dict[str, dict[str, Any]]:
        session_id = normalize_session_id(session_id)
        if not session_id:
            return {}
        try:
            key = self._feedback_key(session_id, fingerprint)
            values = self.redis.hgetall(key)
            if values:
                self.redis.expire(key, self.ttl)
                self.touch_session(session_id)
            return {
                bid_id: json.loads(value)
                for bid_id, value in values.items()
                if value
            }
        except Exception:
            logger.warning(
                "세션 피드백을 읽지 못해 기본 추천을 계속합니다.",
                exc_info=True,
            )
            return {}

    def record_feedback(
        self,
        session_id: str,
        request: FeedbackRequest,
    ) -> dict[str, Any]:
        if not self.is_enabled():
            raise PermissionError("추천 피드백 수집이 비활성화되어 있습니다.")
        session_id = normalize_session_id(session_id)
        if not session_id:
            raise ValueError("유효한 익명 세션이 없습니다.")
        try:
            impression_value = self.redis.get(
                self._impression_key(session_id, request.search_id)
            )
            if not impression_value:
                raise ValueError("검색 세션이 만료되었습니다. 다시 검색해 주세요.")
            impression = json.loads(impression_value)
            bids = impression.get("bids", {})
            if request.bid_id not in bids:
                raise ValueError("현재 검색에서 노출된 공고만 평가할 수 있습니다.")
            fingerprint = str(impression.get("fingerprint", ""))
            if not fingerprint:
                raise ValueError("검색 지문을 확인할 수 없습니다.")

            key = self._feedback_key(session_id, fingerprint)
            existing_value = self.redis.hget(key, request.bid_id)
            existing = (
                json.loads(existing_value)
                if existing_value
                else {}
            )
            if request.feedback_type == "clear":
                if (
                    request.source == "detail"
                    or existing.get("source") == "favorite"
                ):
                    self.redis.hdel(key, request.bid_id)
            else:
                reasons = list(dict.fromkeys(
                    reason.strip()
                    for reason in request.reasons
                    if reason.strip()
                ))
                legacy_reason = request.reason.strip()
                if not reasons and legacy_reason:
                    reasons = [legacy_reason]
                if (
                    request.feedback_type == "negative"
                    and (
                        not reasons
                        or any(reason not in FEEDBACK_REASONS for reason in reasons)
                    )
                ):
                    raise ValueError("부적합 사유를 선택해 주세요.")
                available_conditions = {
                    str(condition.get("id", "")): condition
                    for condition in impression.get("conditions", [])
                    if isinstance(condition, dict)
                    and str(condition.get("id", ""))
                }
                requested_condition_ids = list(dict.fromkeys(
                    condition_id.strip()
                    for condition_id in request.condition_ids
                    if condition_id.strip()
                ))
                invalid_condition_ids = [
                    condition_id
                    for condition_id in requested_condition_ids
                    if condition_id not in available_conditions
                ]
                if invalid_condition_ids:
                    raise ValueError("현재 검색에 포함되지 않은 조건입니다.")
                selected_conditions = [
                    available_conditions[condition_id]
                    for condition_id in requested_condition_ids
                ]
                if not selected_conditions:
                    selected_conditions = self._conditions_for_feedback(
                        list(available_conditions.values()),
                        request.feedback_type,
                        reasons,
                    )
                if not (
                    request.source == "favorite"
                    and existing.get("source") == "detail"
                ):
                    self.redis.hset(
                        key,
                        request.bid_id,
                        json.dumps(
                            {
                                "type": request.feedback_type,
                                "reason": reasons[0] if reasons else legacy_reason,
                                "reasons": reasons,
                                "source": request.source,
                                "features": bids[request.bid_id],
                                "conditions": selected_conditions,
                                "updatedAt": int(time()),
                            },
                            ensure_ascii=False,
                            separators=(",", ":"),
                        ),
                    )
            self.redis.expire(key, self.ttl)
            self.touch_session(session_id)
            return impression
        except ValueError:
            raise
        except Exception as error:
            logger.warning("세션 피드백 저장에 실패했습니다.", exc_info=True)
            raise RuntimeError("피드백을 임시 저장하지 못했습니다.") from error

    @staticmethod
    def _conditions_for_feedback(
        conditions: list[dict[str, Any]],
        feedback_type: str,
        reasons: list[str],
    ) -> list[dict[str, Any]]:
        if feedback_type == "positive":
            return [
                condition
                for condition in conditions
                if condition.get("role") in {"target", "action", "intent"}
            ]

        roles_by_reason = {
            "검색 주제와 다름": {"target", "action", "intent"},
            "업무 구분이 다름": {"category"},
            "지역이 맞지 않음": {"region"},
            "사업금액이 맞지 않음": {"budget"},
            "계약방법이 맞지 않음": {"contract_method"},
            "수요기관이 맞지 않음": {"demand_agency"},
        }
        selected_roles = {
            role
            for reason in reasons
            for role in roles_by_reason.get(reason, set())
        }
        return [
            condition
            for condition in conditions
            if condition.get("role") in selected_roles
        ]

    def status(self) -> dict[str, Any]:
        now = int(time())
        cutoff = now - self.ttl
        summary = {"positive": 0, "negative": 0, "exclude": 0}
        reasons: dict[str, int] = {}
        try:
            self.redis.ping()
            self.redis.zremrangebyscore(self._active_sessions_key(), 0, cutoff)
            active_sessions = int(self.redis.zcard(self._active_sessions_key()))
            pattern = f"{self._namespace()}:items:*"
            for key in self.redis.scan_iter(match=pattern, count=200):
                for value in self.redis.hvals(key):
                    try:
                        item = json.loads(value)
                    except (TypeError, json.JSONDecodeError):
                        continue
                    feedback_type = str(item.get("type", ""))
                    if feedback_type in summary:
                        summary[feedback_type] += 1
                    stored_reasons = item.get("reasons")
                    item_reasons = (
                        [
                            str(reason).strip()
                            for reason in stored_reasons
                            if str(reason).strip()
                        ]
                        if isinstance(stored_reasons, list)
                        else [str(item.get("reason", "")).strip()]
                    )
                    for reason in item_reasons:
                        if reason:
                            reasons[reason] = reasons.get(reason, 0) + 1
            return {
                "feedbackEnabled": self.is_enabled(),
                "redis": {
                    "status": "정상",
                    "activeSessions": active_sessions,
                    "ttlSeconds": self.ttl,
                },
                "feedbackSummary": {
                    **summary,
                    "total": sum(summary.values()),
                },
                "feedbackReasons": dict(
                    sorted(reasons.items(), key=lambda item: (-item[1], item[0]))
                ),
                "versions": recommendation_versions(),
            }
        except Exception:
            logger.warning("피드백 운영 상태를 조회하지 못했습니다.", exc_info=True)
            return {
                "feedbackEnabled": self.is_enabled(),
                "redis": {
                    "status": "오류",
                    "activeSessions": 0,
                    "ttlSeconds": self.ttl,
                },
                "feedbackSummary": {
                    "positive": 0,
                    "negative": 0,
                    "exclude": 0,
                    "total": 0,
                },
                "feedbackReasons": {},
                "versions": recommendation_versions(),
            }


@lru_cache
def feedback_redis_client() -> Redis:
    return Redis.from_url(
        get_settings().redis_url,
        decode_responses=True,
        socket_connect_timeout=0.5,
        socket_timeout=1.0,
    )


@lru_cache
def feedback_store() -> FeedbackStore:
    return FeedbackStore()
