from app.agent.orchestrator import describe_search_intent
from app.knowledge import analyze_query, expand_region
from app.knowledge.catalog import DOMAIN_CONCEPTS
from app.repositories.external_bid_repository import ExternalBidRepository
from app.search_intent import parse_semantic_intent
from app.semantic.engine import SemanticSearchEngine


def test_fallback_semantic_vector_prefers_related_document(monkeypatch) -> None:
    engine = SemanticSearchEngine()
    engine.enabled = True
    engine._model_failed = True
    documents = engine.embed(
        [
            "친환경 사과와 과일 납품 사업",
            "공공청사 네트워크 개선공사",
        ]
    )

    scores = engine.score(
        "사과 납품",
        {
            "fruit": documents[0],
            "network": documents[1],
        },
    )

    assert scores["fruit"] > scores.get("network", 0)


def test_natural_language_intent_is_described() -> None:
    conditions = describe_search_intent(
        "경기 지역의 AI 용역 중 5억원 이하를 찾고 장비 납품은 제외해줘."
    )

    assert "우선 지역: 경기" in conditions
    assert "용역" in conditions
    assert "5억원 이하" in conditions
    assert "검색 의도: 인공지능" in conditions
    assert "제외: 장비 납품" in conditions


def test_semantic_query_removes_request_words_and_extracts_anchor() -> None:
    intent = parse_semantic_intent(
        "서울 중학교 수학여행 서비스를 찾아줘"
    )

    assert intent.normalized_query == "서울 중학교 수학여행"
    assert intent.terms == ("서울", "중학교", "수학여행")
    assert intent.anchor_terms == ("수학여행",)
    assert intent.constraint_terms == ("중학교",)


def test_exact_semantic_anchor_filters_and_prioritizes_related_bids() -> None:
    rows = [
        {
            "bid_number": "unrelated",
            "title": "생성형 AI 기반 분석환경 구현 용역",
            "description": "인공지능 시스템 구축",
        },
        {
            "bid_number": "trip",
            "title": "서울중학교 2학년 수학여행 위탁용역",
            "description": "학생 숙박 및 운송",
        },
        {
            "bid_number": "experience",
            "title": "중학생 현장체험학습 운영 용역",
            "description": "서울 지역 학생 대상",
        },
    ]
    intent = parse_semantic_intent(
        "서울 중학교 수학여행 서비스를 찾아줘"
    )

    ranked = ExternalBidRepository._prioritize_semantic_rows(
        rows,
        intent,
        {
            "unrelated": 92,
            "trip": 68,
            "experience": 72,
        },
    )

    assert [row["bid_number"] for row in ranked] == ["trip"]


def test_all_bid_knowledge_domains_are_loaded() -> None:
    assert len(DOMAIN_CONCEPTS) >= 48
    assert {
        "업무 구분",
        "품목·서비스",
        "업종·면허",
        "사업 금액",
        "공고 상태",
        "검색 명령 표현",
    }.issubset(DOMAIN_CONCEPTS)


def test_capital_area_is_expanded_by_region_graph() -> None:
    assert expand_region("수도권") == ("서울", "경기", "인천")

    preferred = analyze_query("수도권 중학교 수학여행 찾아줘")
    restricted = analyze_query(
        "수도권 소재 업체가 참가 가능한 중학교 수학여행 찾아줘"
    )

    assert preferred.preferred_regions == ("서울", "경기", "인천")
    assert preferred.participant_regions == ()
    assert restricted.participant_regions == ("서울", "경기", "인천")


def test_knowledge_analysis_extracts_amount_date_and_concepts() -> None:
    analysis = analyze_query(
        "수도권 AI 용역 중 5억원 이하이고 7일 이내 마감 공고"
    )

    assert analysis.category == "용역"
    assert analysis.max_budget == 500_000_000
    assert analysis.closing_within_days == 7
    assert any(
        entity.canonical == "인공지능"
        for entity in analysis.entities
    )
