from __future__ import annotations

from dataclasses import dataclass

from app.knowledge.catalog import concept_variants
from app.knowledge.engine import (
    KnowledgeAnalysis,
    analyze_query,
    knowledge_document_score,
    region_document_score,
)
from app.knowledge.regions import region_aliases


@dataclass(frozen=True)
class SemanticIntent:
    normalized_query: str
    terms: tuple[str, ...]
    anchor_terms: tuple[str, ...]
    constraint_terms: tuple[str, ...]
    analysis: KnowledgeAnalysis


def parse_semantic_intent(text: str) -> SemanticIntent:
    analysis = analyze_query(text)
    return SemanticIntent(
        normalized_query=analysis.normalized_query,
        terms=tuple(
            term
            for term in analysis.terms
            if term not in {
                "이상",
                "초과",
                "이하",
                "미만",
                "부터",
                "까지",
            }
            and not any(character.isdigit() for character in term)
        ),
        anchor_terms=analysis.anchor_terms,
        constraint_terms=analysis.constraint_terms,
        analysis=analysis,
    )


def term_variants(term: str) -> tuple[str, ...]:
    concept_values = concept_variants(term)
    region_values = region_aliases(term)
    return tuple(dict.fromkeys((*concept_values, *region_values))) or (term.lower(),)


def matches_semantic_constraints(
    document: str,
    intent: SemanticIntent,
) -> bool:
    normalized_document = document.lower()
    return all(
        any(variant in normalized_document for variant in term_variants(term))
        for term in intent.constraint_terms
    )


def semantic_lexical_rank(
    *,
    title: str,
    document: str,
    intent: SemanticIntent,
) -> tuple[int, int, int, int, int, int]:
    normalized_title = title.lower()
    normalized_document = document.lower()
    title_matches = 0
    document_matches = 0
    anchor_matches = 0
    exact_phrase = int(
        bool(intent.normalized_query)
        and intent.normalized_query in normalized_title
    )

    for term in intent.terms:
        variants = term_variants(term)
        if any(variant in normalized_title for variant in variants):
            title_matches += 1
        elif any(variant in normalized_document for variant in variants):
            document_matches += 1

    for term in intent.anchor_terms:
        if any(
            variant in normalized_document
            for variant in term_variants(term)
        ):
            anchor_matches += 1

    region_score = region_document_score(document, intent.analysis)
    knowledge_score = knowledge_document_score(
        document,
        intent.analysis,
    )
    return (
        exact_phrase,
        anchor_matches,
        knowledge_score,
        region_score,
        title_matches,
        document_matches,
    )
