from app.agent.orchestrator import build_search_request
from app.scoring import calculate_hybrid_score
from findbid_shared.schemas import SearchRequest


def test_natural_language_query_is_converted_to_filters() -> None:
    request = build_search_request(
        "경기 지역의 AI 용역 중 5억원 이하를 찾고 장비 납품은 제외해줘."
    )

    assert request.region == "경기"
    assert request.category == "용역"
    assert request.max_budget == 500_000_000
    assert "AI" in request.include_keywords
    assert "장비 납품" in request.exclude_keywords


def test_embedding_similarity_is_blended_with_lexical_evidence() -> None:
    score = calculate_hybrid_score(
        corpus="의미가 다른 표현으로 작성된 공고",
        budget=100_000_000,
        days_left=14,
        deadline_known=True,
        is_new=True,
        required_licenses=[],
        region_restriction="",
        sme_only=False,
        request=SearchRequest(semantic_query="사과 납품"),
        company_profile={
            "licenses": [],
            "technologies": [],
            "experiences": [],
            "location": "경기도",
            "size": "중소기업",
            "completion": 80,
        },
        semantic_similarity=92,
    )

    assert score.breakdown["의미 유사도"] == 74
