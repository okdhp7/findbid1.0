from app.feedback import FeedbackStore, apply_feedback_adjustments, search_fingerprint
from findbid_shared.schemas import BidRecord, SearchRequest


def _record(
    bid_id: str,
    *,
    score: int,
    category: str = "용역",
    region: str = "전국",
    contract_method: str = "제한경쟁",
    demand_agency: str = "한국소비자원",
    tags: list[str] | None = None,
) -> BidRecord:
    return BidRecord(
        id=bid_id,
        notice_no=bid_id,
        category=category,
        title=f"{bid_id} 공고",
        agency=demand_agency,
        demand_agency=demand_agency,
        region=region,
        budget=100_000_000,
        contract_method=contract_method,
        close_at="2026.08.01 10:00",
        score=score,
        tags=tags or [],
    )


def test_search_fingerprint_is_shared_between_pages() -> None:
    first = SearchRequest(
        semantic_query="폐기물 처리 용역",
        region="서울",
        page=1,
    )
    second = first.model_copy(update={"page": 2})
    explicit = first.model_copy(update={"search_trigger": "ai_button"})
    different = first.model_copy(update={"region": "경기"})

    assert search_fingerprint(first) == search_fingerprint(second)
    assert search_fingerprint(first) == search_fingerprint(explicit)
    assert search_fingerprint(first) != search_fingerprint(different)


def test_positive_feedback_boosts_direct_and_similar_bids() -> None:
    direct = _record("direct", score=70, tags=["폐기물"])
    similar = _record("similar", score=72, tags=["폐기물"])
    unrelated = _record(
        "unrelated",
        score=73,
        category="물품",
        contract_method="일반경쟁",
        demand_agency="다른 기관",
        tags=["컴퓨터"],
    )
    feedback = {
        "direct": {
            "type": "positive",
            "reason": "",
            "features": {
                "category": "용역",
                "region": "전국",
                "contractMethod": "제한경쟁",
                "demandAgency": "한국소비자원",
                "budget": 100_000_000,
                "tags": ["폐기물"],
            },
        }
    }

    ranked, applied = apply_feedback_adjustments(
        [direct, similar, unrelated],
        feedback,
        10,
    )

    assert applied is True
    by_id = {record.id: record for record in ranked}
    assert by_id["direct"].feedback_adjustment == 5
    assert by_id["direct"].session_feedback == "positive"
    assert by_id["similar"].feedback_adjustment > 0
    assert by_id["unrelated"].feedback_adjustment == 0


def test_favorite_is_a_weaker_positive_signal_than_detail_feedback() -> None:
    favorite_bid = _record("favorite", score=70, tags=["폐기물"])
    similar = _record("similar", score=70, tags=["폐기물"])
    features = {
        "category": "용역",
        "region": "전국",
        "contractMethod": "제한경쟁",
        "demandAgency": "한국소비자원",
        "budget": 100_000_000,
        "tags": ["폐기물"],
    }

    favorite_ranked, _ = apply_feedback_adjustments(
        [favorite_bid, similar],
        {
            "favorite": {
                "type": "positive",
                "source": "favorite",
                "reason": "",
                "features": features,
            }
        },
        10,
    )
    detail_ranked, _ = apply_feedback_adjustments(
        [favorite_bid, similar],
        {
            "favorite": {
                "type": "positive",
                "source": "detail",
                "reason": "",
                "features": features,
            }
        },
        10,
    )

    favorite_by_id = {record.id: record for record in favorite_ranked}
    detail_by_id = {record.id: record for record in detail_ranked}
    assert favorite_by_id["favorite"].feedback_adjustment == 3
    assert favorite_by_id["favorite"].session_feedback_source == "favorite"
    assert favorite_by_id["similar"].feedback_adjustment == 1
    assert detail_by_id["favorite"].feedback_adjustment == 5
    assert detail_by_id["favorite"].session_feedback_source == "detail"


def test_negative_reason_and_exclusion_are_session_scoped() -> None:
    limited = _record("limited", score=80, contract_method="제한경쟁")
    another_limited = _record(
        "another-limited",
        score=79,
        contract_method="제한경쟁",
    )
    open_competition = _record(
        "open",
        score=78,
        contract_method="일반경쟁",
    )
    feedback = {
        "limited": {
            "type": "negative",
            "reason": "계약방법이 맞지 않음",
            "features": {
                "contractMethod": "제한경쟁",
            },
        },
        "open": {
            "type": "exclude",
            "reason": "이미 확인한 공고",
            "features": {},
        },
    }

    ranked, _ = apply_feedback_adjustments(
        [limited, another_limited, open_competition],
        feedback,
        10,
    )

    by_id = {record.id: record for record in ranked}
    assert "open" not in by_id
    assert by_id["limited"].feedback_adjustment == -6
    assert by_id["another-limited"].feedback_adjustment == -2


def test_multiple_negative_reasons_all_adjust_similar_bids() -> None:
    source = _record(
        "source",
        score=80,
        region="전국",
        contract_method="제한경쟁",
    )
    similar = _record(
        "similar",
        score=79,
        region="전국",
        contract_method="제한경쟁",
    )
    feedback = {
        "source": {
            "type": "negative",
            "reasons": ["지역이 맞지 않음", "계약방법이 맞지 않음"],
            "features": {
                "region": "전국",
                "contractMethod": "제한경쟁",
            },
        },
    }

    ranked, _ = apply_feedback_adjustments([source, similar], feedback, 10)

    by_id = {record.id: record for record in ranked}
    assert by_id["source"].feedback_adjustment == -6
    assert by_id["similar"].feedback_adjustment == -4


def test_topic_feedback_uses_condition_roles_for_adjustment() -> None:
    source = _record("source", score=80, tags=["시설물", "환경개선"])
    related = _record("related", score=79, tags=["시설물", "환경개선"])
    unrelated = _record("unrelated", score=78, tags=["정보시스템", "고도화"])
    feedback = {
        "source": {
            "type": "negative",
            "reasons": ["검색 주제와 다름"],
            "features": {
                "category": "용역",
                "tags": ["시설물", "환경개선"],
            },
            "conditions": [
                {
                    "id": "target",
                    "role": "target",
                    "mode": "must",
                    "kind": "semantic",
                    "value": "시설물",
                    "variants": ["시설물"],
                },
                {
                    "id": "action",
                    "role": "action",
                    "mode": "should",
                    "kind": "semantic",
                    "value": "환경개선",
                    "variants": ["환경개선"],
                },
                {
                    "id": "intent",
                    "role": "intent",
                    "mode": "boost",
                    "kind": "semantic",
                    "value": "고도화",
                    "variants": ["고도화", "개선"],
                },
            ],
        },
    }

    ranked, _ = apply_feedback_adjustments(
        [source, related, unrelated],
        feedback,
        10,
    )

    by_id = {record.id: record for record in ranked}
    assert by_id["source"].feedback_adjustment == -6
    assert by_id["related"].feedback_adjustment == -5
    assert by_id["unrelated"].feedback_adjustment == -1


class _SettingsRedis:
    def __init__(self) -> None:
        self.values: dict[tuple[str, str], str] = {}

    def hget(self, key: str, field: str) -> str | None:
        return self.values.get((key, field))

    def hset(self, key: str, field: str, value: str) -> None:
        self.values[(key, field)] = value


def test_feedback_collection_setting_defaults_on_and_can_be_disabled() -> None:
    redis = _SettingsRedis()
    store = FeedbackStore(redis_client=redis)

    assert store.is_enabled() is True
    assert store.set_enabled(False) is False
    assert store.is_enabled() is False
    assert store.set_enabled(True) is True
    assert store.is_enabled() is True
