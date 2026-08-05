from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.knowledge import analyze_query
from app.knowledge.catalog import concept_variants
from findbid_shared.schemas import SearchRequest


TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣+#.]+")
CONCEPT_ALIASES = {
    "생성형 AI": ("생성형 ai", "인공지능", "ai", "llm", "rag", "챗봇", "지능형"),
    "Java": ("java", "자바", "spring", "스프링"),
    "React": ("react", "리액트", "프론트엔드", "웹서비스", "웹 서비스"),
    "Python": ("python", "파이썬", "fastapi", "데이터 분석"),
    "데이터 플랫폼": (
        "데이터 플랫폼",
        "공공데이터",
        "빅데이터",
        "데이터베이스",
        "통합관리",
        "데이터 허브",
    ),
}
REGION_ALIASES = {
    "서울": ("서울특별시", "서울"),
    "부산": ("부산광역시", "부산"),
    "대구": ("대구광역시", "대구"),
    "인천": ("인천광역시", "인천"),
    "광주": ("광주광역시", "광주"),
    "대전": ("대전광역시", "대전"),
    "울산": ("울산광역시", "울산"),
    "세종": ("세종특별자치시", "세종"),
    "경기": ("경기도", "경기"),
    "강원": ("강원특별자치도", "강원도", "강원"),
    "충북": ("충청북도", "충북"),
    "충남": ("충청남도", "충남"),
    "전북": ("전북특별자치도", "전라북도", "전북"),
    "전남": ("전라남도", "전남"),
    "경북": ("경상북도", "경북"),
    "경남": ("경상남도", "경남"),
    "제주": ("제주특별자치도", "제주도", "제주"),
}
FIT_WEIGHTS = {
    "필수자격": 0.22,
    "의미 유사도": 0.22,
    "보유 기술": 0.16,
    "유사 수행실적": 0.16,
    "검색 키워드": 0.11,
    "참가 지역": 0.07,
    "사업 금액": 0.06,
}
QUALIFICATION_TERMS = (
    "참가자격",
    "입찰자격",
    "면허",
    "자격증",
    "등록업체",
    "직접생산",
    "업종코드",
)
MATCHABLE_KNOWLEDGE_DOMAINS = {
    "품목·서비스",
    "사업 분야",
    "산업 분류",
    "학교 유형",
    "업종·면허",
    "기술 분야",
    "제품·기술명 별칭",
    "구축·운영 행위",
    "유사 수행실적",
}


@dataclass(frozen=True)
class HybridScore:
    score: int
    confidence: int
    eligibility: str
    matched: list[str]
    breakdown: dict[str, int]
    reasons: list[str]
    unresolved_requirements: list[str]


def _normalize(value: str) -> str:
    return " ".join(value.lower().replace("·", " ").split())


def _tokens(value: str) -> list[str]:
    return [
        token.lower()
        for token in TOKEN_PATTERN.findall(value)
        if len(token) >= 2
    ]


def _matches(corpus: str, value: str) -> bool:
    normalized = _normalize(value)
    if not normalized:
        return False
    if normalized in corpus:
        return True
    meaningful = [
        token
        for token in _tokens(normalized)
        if token not in {"사업", "구축", "용역"}
    ]
    return bool(meaningful) and all(token in corpus for token in meaningful)


def _concept_matches(corpus: str, values: list[str]) -> list[str]:
    matched: list[str] = []
    for value in values:
        aliases = CONCEPT_ALIASES.get(value, (value,))
        if any(_normalize(alias) in corpus for alias in aliases):
            matched.append(value)
    return matched


def _matched_evidence_score(match_count: int) -> int:
    """프로필 항목 수가 아니라 확인된 관련 근거 수를 점수화한다."""
    if match_count <= 0:
        return 0
    return min(100, 70 + (match_count - 1) * 15)


def _weighted_fit_score(
    breakdown: dict[str, int],
    active_names: list[str],
) -> int:
    active_weights = {
        name: FIT_WEIGHTS[name]
        for name in active_names
        if name in FIT_WEIGHTS
    }
    weight_total = sum(active_weights.values())
    if weight_total <= 0:
        return 0
    return round(
        sum(breakdown[name] * weight for name, weight in active_weights.items())
        / weight_total
    )


def _term_score(
    corpus: str,
    values: list[str],
    neutral: int = 50,
) -> tuple[int, list[str]]:
    unique_values = list(
        dict.fromkeys(value.strip() for value in values if value.strip())
    )
    if not unique_values:
        return neutral, []
    matched = [value for value in unique_values if _matches(corpus, value)]
    return round(len(matched) / len(unique_values) * 100), matched


def _search_condition_values(request: SearchRequest) -> list[str]:
    values: list[str] = []
    sources = [
        request.semantic_query,
        *request.include_keywords,
    ]
    for source in sources:
        if not source.strip():
            continue
        analysis = analyze_query(source)
        normalized_source = source.lower()
        source_values = [
            (
                normalized_source.find(entity.matched_text.lower()),
                entity.canonical,
            )
            for entity in analysis.entities
            if entity.domain in MATCHABLE_KNOWLEDGE_DOMAINS
        ]
        source_values.extend(
            (
                normalized_source.find(value.lower()),
                value,
            )
            for value in analysis.free_text_terms
        )
        values.extend(
            value
            for _, value in sorted(
                source_values,
                key=lambda item: (
                    item[0] if item[0] >= 0 else len(normalized_source),
                    item[1],
                ),
            )
        )

    return list(
        dict.fromkeys(
            value.strip()
            for value in values
            if value.strip()
        )
    )


def _search_condition_score(
    corpus: str,
    values: list[str],
    neutral: int = 50,
) -> tuple[int, list[str]]:
    if not values:
        return neutral, []
    matched = [
        value
        for value in values
        if any(
            _matches(corpus, variant)
            for variant in concept_variants(value)
        )
    ]
    return round(len(matched) / len(values) * 100), matched


def _region_key(value: str) -> str | None:
    normalized = _normalize(value)
    for key, aliases in REGION_ALIASES.items():
        if any(_normalize(alias) in normalized for alias in aliases):
            return key
    return None


def _region_keys(value: str) -> set[str]:
    normalized = _normalize(value)
    return {
        key
        for key, aliases in REGION_ALIASES.items()
        if any(_normalize(alias) in normalized for alias in aliases)
    }


def _license_matches(requirement: str, licenses: list[str]) -> bool:
    requirement_text = _normalize(requirement)
    for license_name in licenses:
        license_text = _normalize(license_name)
        if license_text in requirement_text or requirement_text in license_text:
            return True
        license_tokens = [
            token
            for token in _tokens(license_text)
            if token not in {"사업자", "신고", "등록", "면허"}
        ]
        if license_tokens and all(token in requirement_text for token in license_tokens):
            return True
    return False


def _recommendation_confidence(
    *,
    corpus: str,
    budget: int,
    deadline_known: bool,
    required_licenses: list[str],
    license_data_known: bool,
    region_restriction: str,
    sme_only: bool,
    semantic_similarity: int | None,
    search_condition_values: list[str],
    capability_values: list[str],
    experiences: list[str],
    effective_max_budget: int | None,
    request: SearchRequest,
    company_profile: dict[str, Any],
    breakdown: dict[str, int],
    unresolved: list[str],
) -> int:
    """추천점수를 뒷받침하는 데이터와 평가 근거의 신뢰도를 계산한다."""
    profile_quality = max(
        0,
        min(100, int(company_profile.get("completion", 0))),
    )

    unique_corpus_tokens = set(_tokens(corpus))
    corpus_quality = min(100, round(len(unique_corpus_tokens) / 18 * 100))
    qualification_quality = 100 if license_data_known else 45
    semantic_data_quality = (
        100
        if semantic_similarity is not None
        else 70
        if search_condition_values
        else 50
    )
    bid_data_quality = round(
        corpus_quality * 0.35
        + (100 if budget > 0 else 0) * 0.20
        + (100 if deadline_known else 0) * 0.20
        + qualification_quality * 0.10
        + semantic_data_quality * 0.15
    )

    evidence_flags = [
        license_data_known,
        bool(corpus.strip()),
        bool(search_condition_values or semantic_similarity is not None),
        bool(capability_values),
        bool(experiences),
        bool(budget > 0 and effective_max_budget),
        deadline_known,
    ]
    evidence_coverage = round(
        sum(evidence_flags) / len(evidence_flags) * 100
    )
    analysis_quality = (
        100
        if semantic_similarity is not None
        else 72
        if search_condition_values
        else 55
    )
    unresolved_penalty = min(28, len(unresolved) * 7)

    confidence = round(
        profile_quality * 0.30
        + bid_data_quality * 0.35
        + evidence_coverage * 0.20
        + analysis_quality * 0.15
        - unresolved_penalty
    )
    return max(0, min(100, confidence))


def calculate_hybrid_score(
    *,
    corpus: str,
    budget: int,
    days_left: int,
    deadline_known: bool,
    is_new: bool,
    required_licenses: list[str],
    region_restriction: str,
    sme_only: bool,
    request: SearchRequest,
    company_profile: dict[str, Any],
    semantic_similarity: int | None = None,
    license_data_known: bool = True,
) -> HybridScore:
    normalized_corpus = _normalize(corpus)
    licenses = [str(value) for value in company_profile.get("licenses", [])]
    technologies = [str(value) for value in company_profile.get("technologies", [])]
    business_areas = [
        str(value) for value in company_profile.get("business_areas", [])
    ]
    experiences = [str(value) for value in company_profile.get("experiences", [])]
    excluded_business_areas = [
        str(value)
        for value in company_profile.get("excluded_business_areas", [])
    ]
    service_regions = [
        str(value).strip()
        for value in company_profile.get("service_regions", [])
        if str(value).strip()
    ]

    unresolved: list[str] = []
    qualification_parts: list[int] = []
    hard_failure = False

    if required_licenses:
        matched_license_count = sum(
            _license_matches(str(requirement), licenses)
            for requirement in required_licenses
        )
        qualification_parts.append(
            round(matched_license_count / len(required_licenses) * 100)
        )
        unresolved.extend(
            f"면허 확인: {requirement}"
            for requirement in required_licenses
            if not _license_matches(str(requirement), licenses)
        )
        if matched_license_count < len(required_licenses):
            hard_failure = True
    elif not license_data_known and any(
        term in normalized_corpus for term in QUALIFICATION_TERMS
    ):
        qualification_parts.append(50)
        unresolved.append("면허·자격 정보가 구조화되지 않아 공고문 확인 필요")
    else:
        qualification_parts.append(100)

    company_region = _region_key(str(company_profile.get("location", "")))
    required_regions = _region_keys(region_restriction)
    service_region_keys = {
        region
        for value in service_regions
        for region in _region_keys(value)
    }
    serves_nationwide = any(
        _normalize(value).replace(" ", "") in {"전국", "전체지역"}
        for value in service_regions
    )
    if not region_restriction.strip() or "전국" in region_restriction:
        region_score = 100
    elif service_regions and (
        serves_nationwide
        or bool(service_region_keys & required_regions)
    ):
        region_score = 100
    elif service_regions:
        region_score = 0
        hard_failure = True
        unresolved.append(f"수행 가능 지역 불일치: {region_restriction}")
    elif company_region and company_region in required_regions:
        region_score = 100
    else:
        region_score = 0
        hard_failure = True
        unresolved.append(f"기업 소재지 불일치: {region_restriction}")

    company_size = str(company_profile.get("size", ""))
    if sme_only and "중소" not in company_size and "소상공" not in company_size:
        qualification_parts.append(0)
        hard_failure = True
        unresolved.append("중소기업 또는 소상공인 자격 확인")
    else:
        qualification_parts.append(100)

    excluded_matches = [
        value
        for value in excluded_business_areas
        if _matches(normalized_corpus, value)
    ]
    if excluded_matches:
        qualification_parts.append(0)
        hard_failure = True
        unresolved.append(
            "제외 사업 분야 일치: " + ", ".join(excluded_matches)
        )

    qualification_score = round(sum(qualification_parts) / len(qualification_parts))

    capability_values = [*technologies, *business_areas]
    matched_technologies = _concept_matches(normalized_corpus, capability_values)
    technology_score = (
        _matched_evidence_score(len(matched_technologies))
        if capability_values
        else 50
    )

    search_condition_values = _search_condition_values(request)
    lexical_semantic_score, search_condition_matches = (
        _search_condition_score(
            normalized_corpus,
            search_condition_values,
        )
    )
    semantic_score = (
        round(
            max(0, min(100, semantic_similarity)) * 0.80
            + lexical_semantic_score * 0.20
        )
        if semantic_similarity is not None
        else lexical_semantic_score
    )
    keyword_score, _ = _term_score(
        normalized_corpus,
        list(request.include_keywords),
    )

    if experiences:
        _, matched_experiences = _term_score(
            normalized_corpus,
            experiences,
        )
        experience_score = _matched_evidence_score(len(matched_experiences))
    else:
        experience_score = 50
        matched_experiences = []

    preferred_max_budget = company_profile.get("preferred_max_budget")
    effective_max_budget = preferred_max_budget or request.max_budget
    if budget <= 0 or not effective_max_budget:
        budget_score = 50
    elif budget <= int(effective_max_budget):
        budget_score = 100
    else:
        budget_score = max(
            0,
            round(100 - ((budget / int(effective_max_budget)) - 1) * 100),
        )

    breakdown = {
        "필수자격": qualification_score,
        "의미 유사도": semantic_score,
        "보유 기술": technology_score,
        "유사 수행실적": experience_score,
        "검색 키워드": keyword_score,
        "참가 지역": region_score,
        "사업 금액": budget_score,
    }
    weighted_score = _weighted_fit_score(
        breakdown,
        list(FIT_WEIGHTS),
    )

    if hard_failure:
        eligibility = "참가 어려움"
        weighted_score = min(weighted_score, 39)
    elif unresolved:
        eligibility = "확인 필요"
    else:
        eligibility = "참가 가능"

    confidence = _recommendation_confidence(
        corpus=corpus,
        budget=budget,
        deadline_known=deadline_known,
        required_licenses=required_licenses,
        license_data_known=license_data_known,
        region_restriction=region_restriction,
        sme_only=sme_only,
        semantic_similarity=semantic_similarity,
        search_condition_values=search_condition_values,
        capability_values=capability_values,
        experiences=experiences,
        effective_max_budget=effective_max_budget,
        request=request,
        company_profile=company_profile,
        breakdown=breakdown,
        unresolved=unresolved,
    )

    matched = search_condition_matches
    reasons: list[str] = []
    if eligibility == "참가 가능" and (
        license_data_known or required_licenses or region_restriction.strip() or sme_only
    ):
        reasons.append("현재 등록된 필수 참가자격을 충족합니다.")
    elif eligibility == "참가 가능":
        reasons.append(
            "현재 구조화된 정보에서 명확한 참가 제한은 확인되지 않았으며 "
            "공고문 원문 확인이 필요합니다."
        )
    elif eligibility == "확인 필요":
        reasons.append(f"확인이 필요한 참가자격이 {len(unresolved)}건 있습니다.")
    else:
        reasons.append("명확한 참가 제한 조건이 확인되었습니다.")
    if matched_technologies:
        reasons.append(
            f"보유 기술 {len(matched_technologies)}개가 공고 내용과 일치합니다."
        )
    if search_condition_matches:
        reasons.append(
            "검색조건과 일치하는 핵심 항목 "
            f"{len(search_condition_matches)}개가 확인되었습니다."
        )
    if not experiences:
        reasons.append(
            "수행실적 정보가 없어 유사 실적 항목에 중립 점수를 적용했습니다."
        )
    if is_new:
        reasons.append("최근 7일 이내 등록된 신규 공고입니다.")

    return HybridScore(
        score=max(0, min(100, weighted_score)),
        confidence=max(0, min(100, confidence)),
        eligibility=eligibility,
        matched=matched,
        breakdown=breakdown,
        reasons=reasons,
        unresolved_requirements=unresolved,
    )
