from app.eligibility.rules import COMPANY_PROFILE
from app.scoring import calculate_hybrid_score
from findbid_shared.schemas import CompanyProfileInput, SearchRequest


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
    assert "인공지능" in matching.matched
    assert "웹서비스" in matching.matched
    assert "용역" not in matching.matched
    assert matching.breakdown["보유 기술"] > unrelated.breakdown["보유 기술"]


def test_recommendation_confidence_uses_bid_evidence_not_only_profile_completion() -> None:
    complete_profile = {
        **COMPANY_PROFILE,
        "experiences": ["AI 플랫폼 구축"],
        "preferred_max_budget": 500_000_000,
        "completion": 100,
    }
    request = SearchRequest(
        semantic_query="생성형 AI 플랫폼 구축",
        include_keywords=["AI", "플랫폼"],
        max_budget=500_000_000,
    )
    complete = calculate_hybrid_score(
        corpus="생성형 AI 플랫폼 구축과 운영을 위한 상세 과업 및 기술 요구사항",
        budget=400_000_000,
        days_left=12,
        deadline_known=True,
        is_new=True,
        required_licenses=["소프트웨어사업자"],
        region_restriction="경기도",
        sme_only=True,
        request=request,
        company_profile=complete_profile,
        semantic_similarity=92,
    )
    incomplete = calculate_hybrid_score(
        corpus="AI 사업",
        budget=0,
        days_left=0,
        deadline_known=False,
        is_new=True,
        required_licenses=[],
        region_restriction="",
        sme_only=False,
        request=request,
        company_profile=complete_profile,
        semantic_similarity=None,
    )

    assert complete.confidence < 100
    assert incomplete.confidence < complete.confidence


def test_unresolved_requirements_reduce_recommendation_confidence() -> None:
    common = {
        "corpus": "부산 지역 AI 플랫폼 구축 사업의 상세 과업과 참가자격",
        "budget": 300_000_000,
        "days_left": 10,
        "deadline_known": True,
        "is_new": True,
        "required_licenses": [],
        "sme_only": False,
        "request": SearchRequest(semantic_query="AI 플랫폼 구축"),
        "company_profile": {**COMPANY_PROFILE, "completion": 100},
        "semantic_similarity": 85,
    }
    nationwide = calculate_hybrid_score(
        **common,
        region_restriction="",
    )
    region_mismatch = calculate_hybrid_score(
        **common,
        region_restriction="부산광역시",
    )

    assert region_mismatch.unresolved_requirements
    assert region_mismatch.confidence < nationwide.confidence


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


def test_matched_items_only_show_canonical_search_conditions() -> None:
    result = calculate_hybrid_score(
        corpus="AI 데이터 분석 활용 환경 구축 용역",
        budget=50_000_000,
        days_left=6,
        deadline_known=True,
        is_new=True,
        required_licenses=[],
        region_restriction="",
        sme_only=False,
        request=SearchRequest(semantic_query="AI 데이터 분석 용역"),
        company_profile=COMPANY_PROFILE,
    )

    assert result.matched == ["인공지능", "빅데이터"]
    assert "ai" not in result.matched
    assert "데이터" not in result.matched
    assert "분석" not in result.matched
    assert "용역" not in result.matched
    assert "Python" not in result.matched


def test_matched_items_are_empty_without_content_search_conditions() -> None:
    result = calculate_hybrid_score(
        corpus="생성형 AI Java React 데이터 플랫폼 구축",
        budget=50_000_000,
        days_left=6,
        deadline_known=True,
        is_new=True,
        required_licenses=[],
        region_restriction="",
        sme_only=False,
        request=SearchRequest(),
        company_profile=COMPANY_PROFILE,
    )

    assert result.matched == []


def test_user_company_profile_changes_eligibility_and_excluded_area() -> None:
    custom_profile = CompanyProfileInput.model_validate(
        {
            **COMPANY_PROFILE,
            "location": "부산광역시",
            "licenses": ["폐기물처리업"],
            "technologies": ["폐기물 처리"],
            "businessAreas": ["환경 용역"],
            "excludedBusinessAreas": [],
            "completion": 100,
        }
    ).model_dump(by_alias=False)
    common = {
        "corpus": "부산 지역 폐기물 처리 환경 용역",
        "budget": 100_000_000,
        "days_left": 14,
        "deadline_known": True,
        "is_new": False,
        "required_licenses": ["폐기물처리업"],
        "region_restriction": "부산광역시",
        "sme_only": True,
        "request": SearchRequest(semantic_query="부산 폐기물 처리 용역"),
    }

    eligible = calculate_hybrid_score(
        **common,
        company_profile=custom_profile,
    )
    excluded = calculate_hybrid_score(
        **common,
        company_profile={
            **custom_profile,
            "excluded_business_areas": ["폐기물 처리"],
        },
    )

    assert eligible.eligibility == "참가 가능"
    assert eligible.breakdown["보유 기술"] > 0
    assert excluded.eligibility == "참가 어려움"
    assert excluded.score <= 39
    assert any(
        "제외 사업 분야 일치" in item
        for item in excluded.unresolved_requirements
    )


def test_missing_explicit_required_license_is_hard_failure() -> None:
    result = calculate_hybrid_score(
        corpus="AI 플랫폼 구축 소프트웨어 용역",
        budget=200_000_000,
        days_left=10,
        deadline_known=True,
        is_new=False,
        required_licenses=["소프트웨어사업자"],
        region_restriction="",
        sme_only=False,
        request=SearchRequest(semantic_query="AI 플랫폼 구축"),
        company_profile={**COMPANY_PROFILE, "licenses": []},
    )

    assert result.eligibility == "참가 어려움"
    assert result.score <= 39
    assert "면허 확인: 소프트웨어사업자" in result.unresolved_requirements


def test_adding_unrelated_capabilities_does_not_reduce_fit_or_confidence() -> None:
    request = SearchRequest(semantic_query="생성형 AI Java 플랫폼 구축")
    common = {
        "corpus": "생성형 AI Java 플랫폼 구축",
        "budget": 300_000_000,
        "days_left": 10,
        "deadline_known": True,
        "is_new": False,
        "required_licenses": [],
        "region_restriction": "",
        "sme_only": False,
        "request": request,
    }
    base = calculate_hybrid_score(
        **common,
        company_profile={
            **COMPANY_PROFILE,
            "technologies": ["생성형 AI", "Java"],
            "business_areas": [],
            "completion": 100,
        },
    )
    expanded = calculate_hybrid_score(
        **common,
        company_profile={
            **COMPANY_PROFILE,
            "technologies": [
                "생성형 AI",
                "Java",
                *[f"무관 기술 {index}" for index in range(10)],
            ],
            "business_areas": [],
            "completion": 100,
        },
    )

    assert expanded.breakdown["보유 기술"] == base.breakdown["보유 기술"]
    assert expanded.score == base.score
    assert expanded.confidence == base.confidence


def test_adding_unrelated_experience_does_not_dilute_matching_experience() -> None:
    common = {
        "corpus": "생성형 AI 플랫폼 구축 및 운영",
        "budget": 300_000_000,
        "days_left": 10,
        "deadline_known": True,
        "is_new": False,
        "required_licenses": [],
        "region_restriction": "",
        "sme_only": False,
        "request": SearchRequest(semantic_query="생성형 AI 플랫폼 구축"),
    }
    matching = calculate_hybrid_score(
        **common,
        company_profile={
            **COMPANY_PROFILE,
            "experiences": ["생성형 AI 플랫폼 구축"],
        },
    )
    expanded = calculate_hybrid_score(
        **common,
        company_profile={
            **COMPANY_PROFILE,
            "experiences": ["생성형 AI 플랫폼 구축", "조경 시설물 유지관리"],
        },
    )

    assert expanded.breakdown["유사 수행실적"] == matching.breakdown["유사 수행실적"]
    assert expanded.score == matching.score


def test_deadline_and_recency_are_excluded_from_fit_score() -> None:
    common = {
        "corpus": "생성형 AI 플랫폼 구축",
        "budget": 300_000_000,
        "required_licenses": [],
        "region_restriction": "",
        "sme_only": False,
        "request": SearchRequest(semantic_query="생성형 AI 플랫폼 구축"),
        "company_profile": COMPANY_PROFILE,
    }
    urgent = calculate_hybrid_score(
        **common,
        days_left=1,
        deadline_known=True,
        is_new=True,
    )
    relaxed = calculate_hybrid_score(
        **common,
        days_left=20,
        deadline_known=True,
        is_new=False,
    )

    assert "수행 준비도" not in urgent.breakdown
    assert "신규 공고" not in urgent.breakdown
    assert urgent.score == relaxed.score


def test_unstructured_license_evidence_requires_original_notice_review() -> None:
    result = calculate_hybrid_score(
        corpus="AI 플랫폼 구축 입찰참가자격과 업종코드는 공고문 참조",
        budget=300_000_000,
        days_left=10,
        deadline_known=True,
        is_new=False,
        required_licenses=[],
        region_restriction="",
        sme_only=False,
        request=SearchRequest(semantic_query="AI 플랫폼 구축"),
        company_profile=COMPANY_PROFILE,
        license_data_known=False,
    )

    assert result.eligibility == "확인 필요"
    assert any("공고문 확인 필요" in item for item in result.unresolved_requirements)


def test_any_allowed_region_matches_company_location() -> None:
    result = calculate_hybrid_score(
        corpus="AI 플랫폼 구축",
        budget=300_000_000,
        days_left=10,
        deadline_known=True,
        is_new=False,
        required_licenses=[],
        region_restriction="서울특별시 또는 경기도",
        sme_only=False,
        request=SearchRequest(semantic_query="AI 플랫폼 구축"),
        company_profile=COMPANY_PROFILE,
    )

    assert result.eligibility == "참가 가능"
    assert result.breakdown["참가 지역"] == 100


def test_bid_below_preferred_max_budget_receives_full_budget_fit() -> None:
    result = calculate_hybrid_score(
        corpus="AI 플랫폼 구축",
        budget=50_000_000,
        days_left=10,
        deadline_known=True,
        is_new=False,
        required_licenses=[],
        region_restriction="",
        sme_only=False,
        request=SearchRequest(semantic_query="AI 플랫폼 구축"),
        company_profile={**COMPANY_PROFILE, "preferred_max_budget": 500_000_000},
    )

    assert result.breakdown["사업 금액"] == 100
