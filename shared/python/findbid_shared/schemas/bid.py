from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )


class BidRecord(CamelModel):
    id: str
    notice_no: str
    category: str
    title: str
    agency: str
    demand_agency: str
    region: str = "전국"
    budget: int = 0
    budget_label: str = "금액 미정"
    contract_method: str = "확인 필요"
    award_method: str = "확인 필요"
    close_at: str
    days_left: int = 0
    score: int = Field(default=70, ge=0, le=100)
    score_confidence: int = Field(default=0, ge=0, le=100)
    score_breakdown: dict[str, int] = Field(default_factory=dict)
    score_reasons: list[str] = Field(default_factory=list)
    unresolved_requirements: list[str] = Field(default_factory=list)
    eligibility: str = "확인 필요"
    summary: str = ""
    matched: list[str] = Field(default_factory=list)
    requirements: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    is_new: bool = False
    source_url: str | None = None
    raw_data: dict = Field(default_factory=dict)


class SearchRequest(CamelModel):
    category: str | None = None
    region: str | None = None
    max_budget: int | None = None
    include_keywords: list[str] = Field(default_factory=list)
    exclude_keywords: list[str] = Field(default_factory=list)
    only_eligible: bool = False
    closing_within_days: int | None = None
    semantic_query: str = ""
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=200)


class QueryPlan(CamelModel):
    hard_filters: dict = Field(default_factory=dict)
    keywords: dict = Field(default_factory=dict)
    semantic_query: str = ""
    interpreted_conditions: list[str] = Field(default_factory=list)
    semantic_engine: str = ""


class SearchResponse(CamelModel):
    query_plan: QueryPlan
    database_total: int
    total: int
    eligible_total: int
    closing_soon_total: int
    average_score: int
    items: list[BidRecord]
