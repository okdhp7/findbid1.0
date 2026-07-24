from app.eligibility.rules import COMPANY_PROFILE
from app.scoring import calculate_hybrid_score
from findbid_shared.schemas import SearchRequest


def test_profile_matching_bid_scores_higher_than_unrelated_bid() -> None:
    request = SearchRequest(
        include_keywords=["AI", "웹서비스"],
        semantic_query="생성형 AI 웹서비스 구축",
        max_budget=500_000_000,
    )
    common = {
        "budget": 400_000_000,
        "days_left": 12,
        "deadline_known": True,
        "is_new": True,
        "required_licenses": ["소프트웨어사업자"],
        "region_restriction": "",
        "sme_only": True,
        "request": request,
        "company_profile": COMPANY_PROFILE,
    }

    matching = calculate_hybrid_score(
        corpus="생성형 AI 기반 Java React 웹서비스와 데이터 플랫폼 구축",
        **common,
    )
    unrelated = calculate_hybrid_score(
        corpus="조경 시설물과 도로 포장 공사",
        **common,
    )

    assert matching.score > unrelated.score
    assert matching.eligibility == "참가 가능"
    assert "생성형 AI" in matching.matched
    assert matching.breakdown["보유 기술"] > unrelated.breakdown["보유 기술"]


def test_region_failure_caps_score_and_exposes_reason() -> None:
    result = calculate_hybrid_score(
        corpus="생성형 AI Java React 플랫폼 구축",
        budget=300_000_000,
        days_left=10,
        deadline_known=True,
        is_new=True,
        required_licenses=[],
        region_restriction="부산광역시",
        sme_only=False,
        request=SearchRequest(semantic_query="AI 플랫폼"),
        company_profile=COMPANY_PROFILE,
    )

    assert result.eligibility == "참가 어려움"
    assert result.score <= 39
    assert any("지역 제한 불일치" in item for item in result.unresolved_requirements)
