from app.agent.orchestrator import describe_search_intent
from app.knowledge import analyze_query, expand_region
from app.knowledge.catalog import DOMAIN_CONCEPTS
from app.repositories.external_bid_repository import ExternalBidRepository
from app.search_intent import parse_semantic_intent
from app.search_conditions import build_search_conditions, describe_conditions
from app.semantic.engine import SemanticSearchEngine
from findbid_shared.schemas import SearchRequest


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
    assert "업무구분: 용역" in conditions
    assert "사업금액: 5억원 이하" in conditions
    assert "필수 핵심어: 인공지능" in conditions
    assert "제외: 장비 납품" in conditions


def test_conditions_with_the_same_role_are_grouped_for_display() -> None:
    conditions = describe_search_intent(
        "수도권 일반경쟁 torch pandas numpy Python 인공지능 구축"
    )

    assert conditions == [
        "우선 지역: 수도권",
        "계약방법: 일반경쟁",
        "필수 핵심어: torch · pandas · numpy · Python · 인공지능",
        "우선 조건: 구축",
    ]


def test_semantic_query_removes_request_words_and_extracts_anchor() -> None:
    intent = parse_semantic_intent(
        "서울 중학교 수학여행 서비스를 찾아줘"
    )

    assert intent.normalized_query == "서울 중학교 수학여행"
    assert intent.terms == ("서울", "중학교", "수학여행")
    assert intent.anchor_terms == ("수학여행",)
    assert intent.constraint_terms == ("중학교",)


def test_local_scope_and_compound_category_are_not_required_keywords() -> None:
    analysis = analyze_query("관내 상수도공사")

    assert analysis.category == "공사"
    assert analysis.terms == ("상수도", "공사")
    assert analysis.free_text_terms == ("상수도",)
    assert "관내" not in analysis.normalized_query
    assert describe_conditions(analysis) == [
        "업무구분: 공사",
        "필수 핵심어: 상수도",
    ]


def test_korean_domain_noun_ending_in_do_is_preserved() -> None:
    analysis = analyze_query("상수도")

    assert analysis.terms == ("상수도",)
    assert analysis.free_text_terms == ("상수도",)
    assert describe_conditions(analysis) == ["필수 핵심어: 상수도"]


def test_compound_category_suffixes_are_split_generally() -> None:
    cases = (
        ("기술자문용역", "용역", "기술자문"),
        ("홍보물품", "물품", "홍보"),
        ("배관공사", "공사", "배관"),
    )

    for query, category, target in cases:
        analysis = analyze_query(query)
        assert analysis.category == category
        assert analysis.free_text_terms == (target,)


def test_purchase_words_infer_goods_when_category_is_not_explicit() -> None:
    cases = (
        ("노트북 구매", "노트북"),
        ("사무용 가구 구입", "사무용 가구"),
        ("보안장비 도입", "보안장비"),
    )

    for query, target in cases:
        analysis = analyze_query(query)
        assert analysis.category == "물품"
        assert target in " ".join(analysis.free_text_terms)
        assert describe_conditions(analysis)[0] == "업무구분: 물품"


def test_digital_introduction_does_not_force_goods_category() -> None:
    assert analyze_query("AI 시스템 도입").category is None
    assert analyze_query("클라우드 플랫폼 도입").category is None


def test_explicit_category_overrides_purchase_inference() -> None:
    assert analyze_query("시스템 도입 용역").category == "용역"
    assert analyze_query("자재 구매 공사").category == "공사"
    assert analyze_query("장비 구입 물품").category == "물품"


def test_required_semantic_terms_are_applied_before_vector_ranking() -> None:
    repository = object.__new__(ExternalBidRepository)
    conditions, params, _ = repository._search_parts(
        SearchRequest(semantic_query="토목구조물 보수공사")
    )

    assert any(
        "semantic_must_0_0" in condition
        for condition in conditions
    )
    assert params["semantic_must_0_0"] == "%토목구조물%"


def test_detail_keywords_ignore_internal_whitespace_in_sql() -> None:
    repository = object.__new__(ExternalBidRepository)
    spaced_conditions, spaced_params, _ = repository._search_parts(
        SearchRequest(
            include_keywords=["태양광 발전"],
            exclude_keywords=["ESS 장비"],
        )
    )
    compact_conditions, compact_params, _ = repository._search_parts(
        SearchRequest(
            include_keywords=["태양광발전"],
            exclude_keywords=["ESS장비"],
        )
    )

    assert spaced_params["include_0"] == compact_params["include_0"] == "%태양광발전%"
    assert spaced_params["exclude_0"] == compact_params["exclude_0"] == "%ess장비%"
    assert any("regexp_replace" in condition for condition in spaced_conditions)
    assert spaced_conditions == compact_conditions


def test_detail_demand_agencies_expand_top_level_and_keep_direct_input(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "app.repositories.external_bid_repository.resolve_demand_agency_filters",
        lambda _values: (["경기도교육청치동고등학교"], ["한국소비자원"]),
    )
    repository = object.__new__(ExternalBidRepository)

    conditions, params, _ = repository._search_parts(
        SearchRequest(demand_agencies=["경기도교육청", "한국소비자원"])
    )

    detail_condition = next(
        condition for condition in conditions if "detail_child_agencies" in condition
    )
    assert "regexp_replace(coalesce(b.agency_name, '')" in detail_condition
    assert "= ANY(:detail_child_agencies)" in detail_condition
    assert "LIKE :detail_demand_agency_0" in detail_condition
    assert params["detail_child_agencies"] == ["경기도교육청치동고등학교"]
    assert params["detail_demand_agency_0"] == "%한국소비자원%"


def test_search_request_accepts_camel_case_demand_agencies() -> None:
    request = SearchRequest.model_validate(
        {"demandAgencies": ["조달청", "한국소비자원"]}
    )

    assert request.demand_agencies == ["조달청", "한국소비자원"]


def test_exact_required_match_survives_semantic_score_threshold() -> None:
    intent = parse_semantic_intent("토목구조물 보수공사")
    rows = [
        {
            "bid_number": "exact",
            "title": "2026년 인천1호선 토목구조물 보수공사",
            "description": "",
        },
        {
            "bid_number": "semantic-only",
            "title": "도시철도 역사 환경개선 공사",
            "description": "",
        },
    ]

    candidates, preserved_count = ExternalBidRepository._semantic_candidates(
        rows,
        intent,
        {"semantic-only": 92},
    )
    ranked = ExternalBidRepository._prioritize_semantic_rows(
        candidates,
        intent,
        {"semantic-only": 92},
    )

    assert preserved_count == 1
    assert {row["bid_number"] for row in candidates} == {
        "exact",
        "semantic-only",
    }
    assert [row["bid_number"] for row in ranked] == ["exact"]


def test_compound_phrase_separates_required_target_and_derived_intent() -> None:
    analysis = analyze_query("시설물 환경개선 사업")
    conditions = build_search_conditions(analysis)
    by_value = {condition.value: condition for condition in conditions}

    assert by_value["시설물"].mode == "must"
    assert by_value["시설물"].role == "target"
    assert by_value["환경개선"].mode == "should"
    assert by_value["환경개선"].role == "action"
    assert by_value["고도화"].mode == "boost"
    assert by_value["고도화"].source == "derived"
    assert describe_conditions(analysis) == [
        "필수 핵심어: 시설물",
        "우선 조건: 환경개선",
        "보조 의도: 고도화",
    ]


def test_derived_intent_cannot_admit_unrelated_bid_without_required_target() -> None:
    rows = [
        {
            "bid_number": "facility",
            "title": "공원 시설물 환경개선 사업",
            "description": "노후 시설 정비",
        },
        {
            "bid_number": "system",
            "title": "행정정보시스템 고도화 사업",
            "description": "기능 개선 및 운영",
        },
    ]

    ranked = ExternalBidRepository._prioritize_semantic_rows(
        rows,
        parse_semantic_intent("시설물 환경개선 사업"),
        {"facility": 70, "system": 95},
    )

    assert [row["bid_number"] for row in ranked] == ["facility"]


def test_explicit_target_and_action_are_combined_instead_of_or_searched() -> None:
    query = "홈페이지 구축 사업 1억원 이상"
    analysis = analyze_query(query)
    conditions = build_search_conditions(
        analysis,
        SearchRequest(semantic_query=query),
    )
    by_value = {condition.value: condition for condition in conditions}

    assert by_value["홈페이지"].mode == "must"
    assert by_value["홈페이지"].role == "target"
    assert {"홈페이지", "웹사이트", "누리집", "웹 포털"}.issubset(
        set(by_value["홈페이지"].variants)
    )
    assert by_value["구축"].mode == "should"
    assert by_value["구축"].role == "action"
    assert describe_conditions(analysis) == [
        "사업금액: 1억원 이상",
        "필수 핵심어: 홈페이지",
        "우선 조건: 구축",
    ]

    rows = [
        {
            "bid_number": "homepage",
            "title": "대표 홈페이지 신규 구축 사업",
            "description": "웹사이트 개발 및 도입",
        },
        {
            "bid_number": "platform",
            "title": "AI 학습 플랫폼 구축 사업",
            "description": "인공지능 서비스 개발",
        },
        {
            "bid_number": "redesign",
            "title": "기관 홈페이지 디자인 개선",
            "description": "화면 재설계",
        },
    ]
    ranked = ExternalBidRepository._prioritize_semantic_rows(
        rows,
        parse_semantic_intent(query),
        {"homepage": 70, "platform": 95, "redesign": 80},
    )

    assert [row["bid_number"] for row in ranked] == ["homepage"]


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


def test_preferred_region_ranks_local_before_nationwide_and_other_regions() -> None:
    rows = [
        {
            "bid_number": "nationwide",
            "title": "학생복 구매",
            "description": "신입생 학생복 구매",
            "region_restriction": "",
            "region_name": "경기도 수원시",
            "noticer_name": "교육부",
        },
        {
            "bid_number": "other",
            "title": "학생복 구매",
            "description": "신입생 학생복 구매",
            "region_restriction": "본사또는참여지사소재지",
            "region_name": "서울특별시",
            "noticer_name": "서울특별시교육청",
        },
        {
            "bid_number": "local",
            "title": "학생복 구매",
            "description": "신입생 학생복 구매",
            "region_restriction": "본사또는참여지사소재지",
            "region_name": "경기도 성남시",
            "noticer_name": "경기도교육청",
        },
    ]
    intent = parse_semantic_intent("경기 학생복 구매")

    ranked = ExternalBidRepository._prioritize_semantic_rows(
        rows,
        intent,
        {
            "nationwide": 80,
            "other": 80,
            "local": 80,
        },
    )

    assert [row["bid_number"] for row in ranked] == [
        "local",
        "nationwide",
        "other",
    ]
    assert ExternalBidRepository._preferred_region_priority(
        rows[2],
        ("경기",),
    ) == 2
    assert ExternalBidRepository._preferred_region_priority(
        rows[0],
        ("경기",),
    ) == 1
    assert ExternalBidRepository._preferred_region_priority(
        rows[1],
        ("경기",),
    ) == 0


def test_participant_region_uses_restriction_and_metropolitan_label() -> None:
    assert ExternalBidRepository._participant_region(
        {
            "region_restriction": "",
            "region_name": "경상북도 상주시",
        }
    ) == "전국"
    assert ExternalBidRepository._participant_region(
        {
            "region_restriction": "본사또는참여지사소재지",
            "region_name": "경상북도 상주시",
        }
    ) == "경북"
    assert ExternalBidRepository._participant_region(
        {
            "region_restriction": "본사소재지",
            "region_name": "충청남도 천안시",
        }
    ) == "충남"


def test_region_filter_uses_restriction_for_nationwide_rows() -> None:
    repository = object.__new__(ExternalBidRepository)
    conditions, params, order_by = repository._search_parts(
        SearchRequest(region="경북")
    )

    region_condition = next(
        condition for condition in conditions if "region_prefix_0" in condition
    )
    assert "coalesce(btrim(b.region_restriction), '') = ''" in region_condition
    assert "coalesce(btrim(b.region_restriction), '') <> ''" in region_condition
    assert "b.region_name LIKE :region_prefix_0" in region_condition
    assert params["region_prefix_0"] == "경상북도%"
    assert "b.region_name IS NULL" not in region_condition
    assert "b.region_restriction" in order_by


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
    assert analysis.min_budget is None
    assert analysis.max_budget == 500_000_000
    assert analysis.closing_within_days == 7
    assert any(
        entity.canonical == "인공지능"
        for entity in analysis.entities
    )


def test_budget_comparison_operators_are_preserved() -> None:
    minimum = analyze_query("반도체 분야 장비 1억원 이상")
    over = analyze_query("반도체 장비 1억원 초과")
    under = analyze_query("반도체 장비 1억원 미만")
    range_query = analyze_query("반도체 장비 1억원부터 5억원까지")

    assert minimum.min_budget == 100_000_000
    assert minimum.max_budget is None
    assert "사업금액: 1억원 이상" in minimum.conditions
    assert over.min_budget == 100_000_000
    assert over.min_budget_inclusive is False
    assert "사업금액: 1억원 초과" in over.conditions
    assert under.max_budget == 100_000_000
    assert under.max_budget_inclusive is False
    assert "사업금액: 1억원 미만" in under.conditions
    assert range_query.min_budget == 100_000_000
    assert range_query.max_budget == 500_000_000
    assert "사업금액: 1억원 이상 5억원 이하" in range_query.conditions
    assert "사업금액: 1억원 이상" not in range_query.conditions
    assert "사업금액: 5억원 이하" not in range_query.conditions


def test_attached_budget_operator_is_not_used_as_a_required_keyword() -> None:
    query = (
        "서울 경기에 인공지능 시스템 구축 용역 사업으로 사업금액 "
        "5억원이상 10억원 이하의 수의계약 또는 제한경쟁 사업을 찾아줘"
    )
    analysis = analyze_query(query)
    conditions = build_search_conditions(analysis)
    repository = object.__new__(ExternalBidRepository)
    _, params, _ = repository._search_parts(SearchRequest(semantic_query=query))

    assert analysis.min_budget == 500_000_000
    assert analysis.max_budget == 1_000_000_000
    assert analysis.free_text_terms == ("시스템",)
    assert "사업금액: 5억원 이상 10억원 이하" in analysis.conditions
    assert all(condition.value != "5억원이상" for condition in conditions)
    assert all(value != "%5억원이상%" for value in params.values())


def test_natural_language_minimum_budget_is_used_in_sql() -> None:
    repository = object.__new__(ExternalBidRepository)
    conditions, params, _ = repository._search_parts(
        SearchRequest(
            semantic_query="반도체 분야 장비 1억원 이상",
        )
    )

    assert params["min_budget"] == 100_000_000
    assert any(">= :min_budget" in condition for condition in conditions)
    assert "max_budget" not in params


def test_detail_budget_selection_remains_a_maximum_filter() -> None:
    repository = object.__new__(ExternalBidRepository)
    conditions, params, _ = repository._search_parts(
        SearchRequest(max_budget=500_000_000)
    )

    assert params["max_budget"] == 500_000_000
    assert any("<= :max_budget" in condition for condition in conditions)
    assert "min_budget" not in params


def test_explicit_semantic_conditions_override_conflicting_detail_filters() -> None:
    query = "서울 소재 업체가 참가 가능한 7일 이내 1억원 이하 용역"
    analysis = analyze_query(query)
    repository = object.__new__(ExternalBidRepository)
    conditions, params, _ = repository._search_parts(
        SearchRequest(
            semantic_query=query,
            category="물품",
            region="부산",
            max_budget=500_000_000,
            closing_within_days=30,
        )
    )

    assert analysis.category == "용역"
    assert analysis.participant_regions == ("서울",)
    assert params["category"] == "용역"
    assert params["max_budget"] == 100_000_000
    assert params["closing_days"] == 7
    assert any("intent_region_0_0" in condition for condition in conditions)
    assert not any("region_prefix_0" in condition for condition in conditions)


def test_demand_agency_and_contract_method_are_hard_filters() -> None:
    query = "수요기관이 한국소비자원이고 제한경쟁 방식인 용역"
    analysis = analyze_query(query)

    assert analysis.category == "용역"
    assert analysis.demand_agencies == ("한국소비자원",)
    assert analysis.contract_methods == ("제한경쟁",)
    assert analysis.anchor_terms == ()
    assert "수요기관: 한국소비자원" in analysis.conditions
    assert "계약방법: 제한경쟁" in analysis.conditions

    repository = object.__new__(ExternalBidRepository)
    conditions, params, _ = repository._search_parts(
        SearchRequest(semantic_query=query)
    )

    assert params["category"] == "용역"
    assert params["demand_agency_0"] == "%한국소비자원%"
    assert params["contract_method_0"] == "%제한경쟁%"
    assert any("b.agency_name" in condition for condition in conditions)
    assert any("b.contract_method" in condition for condition in conditions)

    matched_conditions = repository._matched_search_conditions(
        {
            "agency_name": "한국소비자원",
            "contract_method": "제한경쟁입찰",
        },
        SearchRequest(semantic_query=query),
    )
    assert matched_conditions == [
        "수요기관: 한국소비자원",
        "계약방법: 제한경쟁",
    ]


def test_contract_method_or_connector_is_not_a_required_keyword() -> None:
    query = "수의계약 또는 제한경쟁"
    analysis = analyze_query(query)

    assert set(analysis.contract_methods) == {"수의계약", "제한경쟁"}
    assert analysis.free_text_terms == ()
    assert analysis.anchor_terms == ()
    assert "필수 핵심어: 또는" not in describe_conditions(analysis)
    assert describe_conditions(analysis) == [
        "계약방법: 제한경쟁 · 수의계약",
    ]

    repository = object.__new__(ExternalBidRepository)
    conditions, params, _ = repository._search_parts(
        SearchRequest(semantic_query=query)
    )

    assert params["contract_method_0"] == "%제한경쟁%"
    assert params["contract_method_1"] == "%수의계약%"
    contract_condition = next(
        condition
        for condition in conditions
        if "contract_method_0" in condition
    )
    assert " OR " in contract_condition
    assert not any("semantic_must_" in condition for condition in conditions)


def test_search_conditions_are_not_shown_when_not_requested() -> None:
    repository = object.__new__(ExternalBidRepository)
    matched_conditions = repository._matched_search_conditions(
        {
            "agency_name": "한국소비자원",
            "contract_method": "제한경쟁입찰",
        },
        SearchRequest(semantic_query="소비자 조사 용역"),
    )
    assert matched_conditions == []


def test_semantic_budget_is_shown_as_a_matched_search_condition() -> None:
    repository = object.__new__(ExternalBidRepository)
    matched_conditions = repository._matched_search_conditions(
        {"contract_method": "일반경쟁입찰"},
        SearchRequest(
            semantic_query="폐기물 처리 일반경쟁 중에서 1억 이하"
        ),
    )
    assert matched_conditions == [
        "계약방법: 일반경쟁",
        "사업금액: 1억원 이하",
    ]


def test_zero_detail_budget_uses_semantic_budget_condition() -> None:
    query = "수학여행 사업금액은 1억원 이하"
    analysis = analyze_query(query)
    repository = object.__new__(ExternalBidRepository)
    matched_conditions = repository._matched_search_conditions(
        {},
        SearchRequest(
            semantic_query=query,
            max_budget=0,
        ),
    )

    assert analysis.max_budget == 100_000_000
    assert "사업금액" not in analysis.free_text_terms
    assert matched_conditions == ["사업금액: 1억원 이하"]


def test_semantic_budget_display_overrides_conflicting_detail_budget() -> None:
    repository = object.__new__(ExternalBidRepository)
    matched_conditions = repository._matched_search_conditions(
        {},
        SearchRequest(
            semantic_query="수학여행 사업금액은 1억원 이하",
            max_budget=500_000_000,
        ),
    )

    assert matched_conditions == ["사업금액: 1억원 이하"]


def test_semantic_budget_range_is_shown_as_a_search_condition() -> None:
    repository = object.__new__(ExternalBidRepository)
    matched_conditions = repository._matched_search_conditions(
        {},
        SearchRequest(
            semantic_query="1억원 이상 3억원 이하 폐기물 처리 용역"
        ),
    )
    assert matched_conditions == [
        "사업금액: 1억원 이상 3억원 이하",
    ]


def test_unregistered_compound_keyword_is_shown_and_ranked() -> None:
    analysis = analyze_query(
        "1억원 이상 3억원 이하 폐기물 처리 용역"
    )
    intent = parse_semantic_intent(
        "1억원 이상 3억원 이하 폐기물 처리 용역"
    )

    assert analysis.min_budget == 100_000_000
    assert analysis.max_budget == 300_000_000
    assert analysis.free_text_terms == ("폐기물 처리",)
    assert "핵심어: 폐기물 처리" in analysis.conditions
    assert "폐기물 처리" in intent.anchor_terms
    assert intent.normalized_query == "폐기물 처리 용역"
