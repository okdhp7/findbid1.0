from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass

from app.knowledge.catalog import concept_variants
from app.knowledge.engine import KnowledgeAnalysis
from app.knowledge.regions import region_aliases
from findbid_shared.schemas import SearchRequest


SEMANTIC_ANCHOR_DOMAINS = {
    "품목·서비스",
    "사업 분야",
    "산업 분류",
    "기술 분야",
    "제품·기술명 별칭",
    "구축·운영 행위",
}
ACTION_DOMAIN = "구축·운영 행위"
ACTION_SUFFIXES = (
    "개선",
    "개발",
    "교체",
    "구축",
    "구입",
    "구매",
    "교육",
    "납품",
    "도입",
    "보수",
    "설계",
    "설치",
    "연구",
    "운영",
    "유지관리",
    "위탁",
    "임차",
    "정비",
    "제작",
    "조사",
    "처리",
    "철거",
)


@dataclass(frozen=True)
class SearchCondition:
    id: str
    role: str
    mode: str
    kind: str
    value: str
    variants: tuple[str, ...]
    confidence: float
    source: str

    def to_dict(self) -> dict[str, object]:
        return {
            **asdict(self),
            "variants": list(self.variants),
        }


def _condition_id(kind: str, mode: str, value: str) -> str:
    digest = hashlib.sha1(
        f"{kind}:{mode}:{value}".encode("utf-8")
    ).hexdigest()[:12]
    return f"condition-{digest}"


def _variants(value: str) -> tuple[str, ...]:
    values = (
        *concept_variants(value),
        *region_aliases(value),
    )
    return tuple(dict.fromkeys(
        variant.strip().lower()
        for variant in values
        if variant.strip()
    )) or (value.lower(),)


def _condition(
    *,
    role: str,
    mode: str,
    kind: str,
    value: str,
    confidence: float,
    source: str,
    variants: tuple[str, ...] | None = None,
) -> SearchCondition:
    normalized = value.strip()
    return SearchCondition(
        id=_condition_id(kind, mode, normalized),
        role=role,
        mode=mode,
        kind=kind,
        value=normalized,
        variants=variants or _variants(normalized),
        confidence=confidence,
        source=source,
    )


def _is_embedded_alias(analysis: KnowledgeAnalysis, matched_text: str) -> bool:
    alias = matched_text.strip().lower()
    return any(
        alias != token and alias in token
        for term in analysis.free_text_terms
        for token in term.lower().split()
    )


def _looks_like_action(value: str) -> bool:
    normalized = value.strip().lower()
    return any(normalized.endswith(suffix) for suffix in ACTION_SUFFIXES)


def _free_text_conditions(
    analysis: KnowledgeAnalysis,
    has_explicit_action: bool,
) -> list[SearchCondition]:
    tokens = list(dict.fromkeys(
        token
        for phrase in analysis.free_text_terms
        for token in phrase.split()
        if token
    ))
    if not tokens:
        return []

    action = ""
    target_tokens = tokens
    if not has_explicit_action and len(tokens) >= 2 and _looks_like_action(tokens[-1]):
        action = tokens[-1]
        target_tokens = tokens[:-1]

    conditions = [
        _condition(
            role="target",
            mode="must",
            kind="semantic",
            value=target,
            confidence=0.95,
            source="user",
        )
        for target in target_tokens
    ]
    if action:
        conditions.append(
            _condition(
                role="action",
                mode="should",
                kind="semantic",
                value=action,
                confidence=0.9,
                source="user",
            )
        )
    return conditions


def build_search_conditions(
    analysis: KnowledgeAnalysis,
    request: SearchRequest | None = None,
) -> tuple[SearchCondition, ...]:
    conditions: list[SearchCondition] = []
    semantic_entities = [
        entity
        for entity in analysis.entities
        if entity.domain in SEMANTIC_ANCHOR_DOMAINS
    ]
    explicit_action_entities = [
        entity
        for entity in semantic_entities
        if entity.domain == ACTION_DOMAIN
        and not _is_embedded_alias(analysis, entity.matched_text)
    ]
    conditions.extend(
        _free_text_conditions(
            analysis,
            has_explicit_action=bool(explicit_action_entities),
        )
    )

    for entity in semantic_entities:
        embedded = _is_embedded_alias(analysis, entity.matched_text)
        is_action = entity.domain == ACTION_DOMAIN
        conditions.append(
            _condition(
                role=(
                    "intent"
                    if embedded
                    else "action"
                    if is_action
                    else "target"
                ),
                mode=(
                    "boost"
                    if embedded
                    else "should"
                    if is_action
                    else "must"
                ),
                kind="semantic",
                value=entity.canonical,
                confidence=0.55 if embedded else entity.confidence,
                source="derived" if embedded else "knowledge",
            )
        )

    for value in analysis.constraint_terms:
        conditions.append(
            _condition(
                role="constraint",
                mode="must",
                kind="semantic",
                value=value,
                confidence=1.0,
                source="knowledge",
            )
        )

    for value in analysis.excluded_terms:
        conditions.append(
            _condition(
                role="exclude",
                mode="must_not",
                kind="semantic",
                value=value,
                confidence=1.0,
                source="user",
            )
        )

    if analysis.category or (request and request.category not in {None, "전체"}):
        conditions.append(
            _condition(
                role="category",
                mode="filter",
                kind="category",
                value=analysis.category or str(request.category),
                confidence=1.0,
                source="user",
            )
        )
    regions = analysis.participant_regions or (
        (request.region,)
        if request and request.region not in {None, "전체 지역"}
        else ()
    )
    for region in regions:
        conditions.append(
            _condition(
                role="region",
                mode="filter",
                kind="region",
                value=region,
                confidence=1.0,
                source="user",
            )
        )
    for agency in analysis.demand_agencies:
        conditions.append(
            _condition(
                role="demand_agency",
                mode="filter",
                kind="demand_agency",
                value=agency,
                confidence=1.0,
                source="user",
            )
        )
    for method in analysis.contract_methods:
        conditions.append(
            _condition(
                role="contract_method",
                mode="filter",
                kind="contract_method",
                value=method,
                confidence=1.0,
                source="user",
            )
        )
    if analysis.min_budget is not None or analysis.max_budget is not None:
        label = "사업금액"
        if analysis.min_budget is not None:
            label += f" {analysis.min_budget:,}원 이상"
        if analysis.max_budget is not None:
            label += f" {analysis.max_budget:,}원 이하"
        conditions.append(
            _condition(
                role="budget",
                mode="filter",
                kind="budget",
                value=label,
                confidence=1.0,
                source="user",
            )
        )

    return tuple({
        condition.id: condition
        for condition in conditions
    }.values())


def condition_matches(document: str, condition: SearchCondition) -> bool:
    normalized = document.lower()
    return any(variant in normalized for variant in condition.variants)


def describe_conditions(
    analysis: KnowledgeAnalysis,
    request: SearchRequest | None = None,
) -> list[str]:
    labels = [
        condition
        for condition in analysis.conditions
        if not condition.startswith(("검색 의도:", "핵심어:"))
    ]
    prefix_by_mode_role = {
        ("must", "target"): "필수 핵심어",
        ("must", "constraint"): "필수 조건",
        ("should", "target"): "우선 핵심어",
        ("should", "action"): "우선 조건",
        ("should", "intent"): "검색 의도",
        ("boost", "intent"): "보조 의도",
        ("must_not", "exclude"): "제외",
    }
    grouped_values: dict[str, list[str]] = {}
    for condition in build_search_conditions(analysis, request):
        prefix = prefix_by_mode_role.get((condition.mode, condition.role))
        if prefix:
            values = grouped_values.setdefault(prefix, [])
            if condition.value not in values:
                values.append(condition.value)
    labels.extend(
        f"{prefix}: {' · '.join(values)}"
        for prefix, values in grouped_values.items()
    )
    return list(dict.fromkeys(labels))
