from app.agent.orchestrator import build_search_request


def test_natural_language_query_is_converted_to_filters() -> None:
    request = build_search_request(
        "경기 지역의 AI 용역 중 5억원 이하를 찾고 장비 납품은 제외해줘."
    )

    assert request.region == "경기"
    assert request.category == "용역"
    assert request.max_budget == 500_000_000
    assert "AI" in request.include_keywords
    assert "장비 납품" in request.exclude_keywords
