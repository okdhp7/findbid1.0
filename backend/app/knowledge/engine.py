from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

from .catalog import (
    ALIAS_TO_CONCEPT,
    CONCEPT_BY_KEY,
    SORTED_ALIASES,
)
from .regions import find_regions, region_aliases


TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣+#.]+")
AMOUNT_CONDITION_PATTERN = re.compile(
    r"(\d+(?:\.\d+)?)\s*(억|만)\s*원?\s*(이상|초과|이하|미만)?"
)
AMOUNT_RANGE_PATTERN = re.compile(
    r"(\d+(?:\.\d+)?)\s*(억|만)\s*원?\s*(?:부터|~|-)\s*"
    r"(\d+(?:\.\d+)?)\s*(억|만)\s*원?\s*(?:까지)?"
)
CLOSING_PATTERN = re.compile(r"(\d+)\s*일\s*(?:이내|내)")
PARTICIPANT_REGION_PATTERN = re.compile(
    r"(?:참가|입찰|본점|사업자|업체).{0,12}(?:지역|소재)"
    r"|(?:지역|소재).{0,12}(?:참가|입찰|제한)"
)
REQUEST_PHRASES = (
    "검색해 주세요",
    "검색해주세요",
    "검색해줘",
    "찾아 주세요",
    "찾아주세요",
    "찾아줘",
    "조회해 주세요",
    "조회해주세요",
    "조회해줘",
    "보여 주세요",
    "보여주세요",
    "보여줘",
)
IGNORED_TERMS = {
    "공고",
    "관련",
    "서비스",
    "입찰",
    "사업",
    "조건",
    "해당",
    "중",
    "지역",
    "찾고",
    "원하는",
    "가능한",
}
STRUCTURAL_TERMS = {
    "분야",
    "이상",
    "초과",
    "이하",
    "미만",
    "부터",
    "까지",
    "사이",
    "범위",
}
PARTICLE_SUFFIXES = (
    "으로",
    "에서",
    "에게",
    "까지",
    "부터",
    "처럼",
    "보다",
    "이나",
    "이며",
    "하고",
    "과",
    "와",
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "의",
    "에",
    "도",
    "만",
)


@dataclass(frozen=True)
class KnowledgeEntity:
    domain: str
    canonical: str
    matched_text: str
    confidence: float
    values: tuple[str, ...] = ()
    hard_filter: bool = False


@dataclass(frozen=True)
class KnowledgeAnalysis:
    normalized_query: str
    terms: tuple[str, ...]
    free_text_terms: tuple[str, ...]
    entities: tuple[KnowledgeEntity, ...]
    anchor_terms: tuple[str, ...]
    constraint_terms: tuple[str, ...]
    preferred_regions: tuple[str, ...]
    participant_regions: tuple[str, ...]
    category: str | None
    min_budget: int | None
    max_budget: int | None
    min_budget_inclusive: bool
    max_budget_inclusive: bool
    closing_within_days: int | None
    excluded_terms: tuple[str, ...]
    conditions: tuple[str, ...]


def _strip_particle(token: str) -> str:
    for suffix in PARTICLE_SUFFIXES:
        if token.endswith(suffix) and len(token) - len(suffix) >= 2:
            return token[: -len(suffix)]
    return token


def _amount_value(number: str, unit: str) -> int:
    multiplier = 100_000_000 if unit == "억" else 10_000
    return int(float(number) * multiplier)


def _budget_bounds(
    text: str,
) -> tuple[int | None, int | None, bool, bool]:
    range_match = AMOUNT_RANGE_PATTERN.search(text)
    if range_match:
        return (
            _amount_value(range_match.group(1), range_match.group(2)),
            _amount_value(range_match.group(3), range_match.group(4)),
            True,
            True,
        )

    minimum: int | None = None
    maximum: int | None = None
    minimum_inclusive = True
    maximum_inclusive = True
    matches = list(AMOUNT_CONDITION_PATTERN.finditer(text))
    for match in matches:
        amount = _amount_value(match.group(1), match.group(2))
        operator = match.group(3)
        if operator == "이상":
            minimum = amount
            minimum_inclusive = True
        elif operator == "초과":
            minimum = amount
            minimum_inclusive = False
        elif operator == "미만":
            maximum = amount
            maximum_inclusive = False
        else:
            maximum = amount
            maximum_inclusive = True
    return minimum, maximum, minimum_inclusive, maximum_inclusive


def _budget_label(amount: int) -> str:
    if amount % 100_000_000 == 0:
        return f"{amount // 100_000_000:,}억원"
    if amount % 10_000 == 0:
        return f"{amount // 10_000:,}만원"
    return f"{amount:,}원"


def _is_amount_token(token: str) -> bool:
    return bool(
        re.fullmatch(
            r"\d+(?:\.\d+)?(?:억|만)?원?",
            token,
        )
    )


@lru_cache(maxsize=2048)
def analyze_query(text: str) -> KnowledgeAnalysis:
    original = " ".join(text.strip().split())
    cleaned = original
    for phrase in REQUEST_PHRASES:
        cleaned = cleaned.replace(phrase, " ")

    terms: list[str] = []
    for raw_token in TOKEN_PATTERN.findall(cleaned):
        token = _strip_particle(raw_token.lower()).strip(".")
        if len(token) < 2 or token in IGNORED_TERMS:
            continue
        if token not in terms:
            terms.append(token)

    entities: list[KnowledgeEntity] = []
    occupied: set[tuple[str, str]] = set()
    normalized_text = original.lower()
    for alias in SORTED_ALIASES:
        if len(alias) < 2:
            continue
        if alias not in normalized_text:
            continue
        concept = ALIAS_TO_CONCEPT[alias]
        key = (concept.domain, concept.canonical)
        if key in occupied:
            continue
        occupied.add(key)
        entities.append(
            KnowledgeEntity(
                domain=concept.domain,
                canonical=concept.canonical,
                matched_text=alias,
                confidence=1.0 if alias == concept.canonical.lower() else 0.96,
            )
        )

    region_matches = find_regions(original)
    participant_context = bool(PARTICIPANT_REGION_PATTERN.search(original))
    preferred_regions: list[str] = []
    participant_regions: list[str] = []
    for matched, members in region_matches:
        preferred_regions.extend(members)
        if participant_context:
            participant_regions.extend(members)
        entities.append(
            KnowledgeEntity(
                domain="지역",
                canonical=matched,
                matched_text=matched,
                confidence=1.0,
                values=members,
                hard_filter=participant_context,
            )
        )

    recognized_tokens = {
        _strip_particle(token.lower())
        for entity in entities
        for token in TOKEN_PATTERN.findall(entity.matched_text)
    }
    recognized_tokens.update(
        _strip_particle(token.lower())
        for matched, _ in region_matches
        for token in TOKEN_PATTERN.findall(matched)
    )
    category = next(
        (
            entity.canonical
            for entity in entities
            if entity.domain == "업무 구분"
            and entity.canonical in {"용역", "물품", "공사"}
        ),
        None,
    )
    (
        min_budget,
        max_budget,
        min_budget_inclusive,
        max_budget_inclusive,
    ) = _budget_bounds(original)
    closing_match = CLOSING_PATTERN.search(original)
    closing_days = int(closing_match.group(1)) if closing_match else None

    excluded: list[str] = []
    exclusion_match = re.search(r"(?:제외|빼고)", original)
    if exclusion_match:
        preceding_tokens = TOKEN_PATTERN.findall(
            original[: exclusion_match.start()]
        )
        exclusion_tokens = [
            _strip_particle(token.lower())
            for token in preceding_tokens[-2:]
        ]
        exclusion_phrase = " ".join(
            token
            for token in exclusion_tokens
            if token and token not in IGNORED_TERMS
        )
        if exclusion_phrase:
            excluded.append(exclusion_phrase)

    excluded_tokens = {
        token
        for phrase in excluded
        for token in phrase.split()
    }
    free_text_tokens = [
        term
        for term in terms
        if term not in STRUCTURAL_TERMS
        and term not in recognized_tokens
        and term not in excluded_tokens
        and not _is_amount_token(term)
    ]
    free_text_terms = (
        (" ".join(free_text_tokens),)
        if free_text_tokens
        else ()
    )
    semantic_terms = [
        term
        for term in terms
        if term not in STRUCTURAL_TERMS
        and term not in excluded_tokens
        and not _is_amount_token(term)
    ]

    institution_constraints = [
        entity.canonical.lower()
        for entity in entities
        if entity.domain == "학교 유형"
    ]
    anchor_domains = {
        "품목·서비스",
        "사업 분야",
        "산업 분류",
        "기술 분야",
        "제품·기술명 별칭",
        "구축·운영 행위",
    }
    anchor_terms = [
        entity.canonical.lower()
        for entity in entities
        if entity.domain in anchor_domains
        and entity.canonical not in excluded
    ]
    anchor_terms.extend(free_text_terms)
    if not anchor_terms:
        anchor_terms = [
            term
            for term in terms
            if len(term) >= 4
            or (term.isascii() and len(term) >= 5)
        ]

    conditions: list[str] = []
    if region_matches:
        region_label = "·".join(match[0] for match in region_matches)
        suffix = "참가 지역" if participant_context else "우선 지역"
        conditions.append(f"{suffix}: {region_label}")
    if category:
        conditions.append(category)
    if min_budget:
        operator = "이상" if min_budget_inclusive else "초과"
        conditions.append(f"{_budget_label(min_budget)} {operator}")
    if max_budget:
        operator = "이하" if max_budget_inclusive else "미만"
        conditions.append(f"{_budget_label(max_budget)} {operator}")
    if closing_days:
        conditions.append(f"{closing_days}일 이내 마감")
    core_entities = [
        entity.canonical
        for entity in entities
        if entity.domain not in {
            "지역",
            "업무 구분",
            "사업 금액",
            "가격 기준",
            "일정·기간",
            "상대적 날짜",
            "검색 명령 표현",
            "제외 의도",
        }
        and entity.canonical not in excluded
    ]
    if core_entities:
        conditions.append(
            "검색 의도: " + " · ".join(dict.fromkeys(core_entities))
        )
    if free_text_terms:
        conditions.append(
            "핵심어: " + " · ".join(free_text_terms)
        )
    if excluded:
        conditions.append("제외: " + " · ".join(dict.fromkeys(excluded)))

    return KnowledgeAnalysis(
        normalized_query=" ".join(semantic_terms) or original,
        terms=tuple(terms),
        free_text_terms=free_text_terms,
        entities=tuple(entities),
        anchor_terms=tuple(dict.fromkeys(anchor_terms)),
        constraint_terms=tuple(dict.fromkeys(institution_constraints)),
        preferred_regions=tuple(dict.fromkeys(preferred_regions)),
        participant_regions=tuple(dict.fromkeys(participant_regions)),
        category=category,
        min_budget=min_budget,
        max_budget=max_budget,
        min_budget_inclusive=min_budget_inclusive,
        max_budget_inclusive=max_budget_inclusive,
        closing_within_days=closing_days,
        excluded_terms=tuple(dict.fromkeys(excluded)),
        conditions=tuple(conditions),
    )


def region_document_score(document: str, analysis: KnowledgeAnalysis) -> int:
    normalized = document.lower()
    return sum(
        any(alias in normalized for alias in region_aliases(region))
        for region in analysis.preferred_regions
    )


def knowledge_document_score(
    document: str,
    analysis: KnowledgeAnalysis,
) -> int:
    normalized = document.lower()
    score = region_document_score(document, analysis) * 12
    for entity in analysis.entities:
        if entity.domain in {
            "지역",
            "검색 명령 표현",
            "제외 의도",
        }:
            continue
        concept = CONCEPT_BY_KEY.get((entity.domain, entity.canonical))
        if not concept:
            continue
        if any(alias.lower() in normalized for alias in concept.aliases):
            score += round(concept.weight * entity.confidence)
    return score
