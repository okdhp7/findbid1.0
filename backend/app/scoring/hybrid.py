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
WEIGHTS = {
    "필수자격": 0.20,
    "의미 유사도": 0.20,
    "보유 기술": 0.15,
    "유사 수행실적": 0.15,
    "검색 키워드": 0.10,
    "참가 지역": 0.07,
    "사업 금액": 0.06,
    "수행 준비도": 0.04,
    "신규 공고": 0.03,
}
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
    else:
        qualification_parts.append(100)

    company_region = _region_key(str(company_profile.get("location", "")))
    required_region = _region_key(region_restriction)
    if not region_restriction.strip() or "전국" in region_restriction:
        region_score = 100
    elif company_region and company_region == required_region:
        region_score = 100
    else:
        region_score = 0
        hard_failure = True
        unresolved.append(f"지역 제한 불일치: {region_restriction}")
    qualification_parts.append(region_score)

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
        round(len(matched_technologies) / len(capability_values) * 100)
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
        max(0, min(100, semantic_similarity))
        if semantic_similarity is not None
        else lexical_semantic_score
    )
    keyword_score, _ = _term_score(
        normalized_corpus,
        list(request.include_keywords),
    )

    if experiences:
        experience_score, matched_experiences = _term_score(
            normalized_corpus,
            experiences,
        )
    else:
        experience_score = 50
        matched_experiences = []

    preferred_max_budget = company_profile.get("preferred_max_budget")
    effective_max_budget = preferred_max_budget or request.max_budget
    if budget <= 0 or not effective_max_budget:
        budget_score = 50
    elif budget <= int(effective_max_budget):
        ratio = budget / int(effective_max_budget)
        budget_score = 100 if ratio >= 0.35 else 85
    else:
        budget_score = max(
            0,
            round(100 - ((budget / int(effective_max_budget)) - 1) * 100),
        )

    if not deadline_known:
        readiness_score = 50
    elif days_left >= 14:
        readiness_score = 100
    elif days_left >= 7:
        readiness_score = 80
    elif days_left >= 3:
        readiness_score = 50
    else:
        readiness_score = 25

    recency_score = 100 if is_new else 0
    breakdown = {
        "필수자격": qualification_score,
        "의미 유사도": semantic_score,
        "보유 기술": technology_score,
        "유사 수행실적": experience_score,
        "검색 키워드": keyword_score,
        "참가 지역": region_score,
        "사업 금액": budget_score,
        "수행 준비도": readiness_score,
        "신규 공고": recency_score,
    }
    weighted_score = round(
        sum(breakdown[name] * weight for name, weight in WEIGHTS.items())
    )

    if hard_failure:
        eligibility = "참가 어려움"
        weighted_score = min(weighted_score, 39)
    elif unresolved:
        eligibility = "확인 필요"
        weighted_score = min(weighted_score, 69)
    else:
        eligibility = "참가 가능"

    profile_completion = int(company_profile.get("completion", 0))
    bid_completeness = round(
        sum(
            bool(value)
            for value in (
                normalized_corpus,
                budget,
                deadline_known,
                required_licenses or "면허 제한 없음",
                region_restriction or "지역 제한 없음",
            )
        )
        / 5
        * 100
    )
    confidence = round(profile_completion * 0.65 + bid_completeness * 0.35)

    matched = search_condition_matches
    reasons: list[str] = []
    if eligibility == "참가 가능":
        reasons.append("현재 등록된 필수 참가자격을 충족합니다.")
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
