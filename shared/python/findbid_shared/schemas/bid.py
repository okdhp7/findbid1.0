from __future__ import annotations

from typing import Literal

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


class BidAttachment(CamelModel):
    name: str
    url: str
    size: str = ""
    extension: str = ""
    file_type: str = "기타"


class BidRecord(CamelModel):
    id: str
    notice_no: str
    category: str
    title: str
    agency: str
    demand_agency: str
    demand_agency_type: str = ""
    region: str = "전국"
    budget: int = 0
    budget_label: str = "금액 미정"
    contract_method: str = "확인 필요"
    award_method: str = "확인 필요"
    close_at: str
    days_left: int = 0
    score: int = Field(default=70, ge=0, le=100)
    feedback_adjustment: int = Field(default=0, ge=-10, le=10)
    session_feedback: str | None = None
    session_feedback_source: str | None = None
    score_confidence: int = Field(default=0, ge=0, le=100)
    score_breakdown: dict[str, int] = Field(default_factory=dict)
    score_reasons: list[str] = Field(default_factory=list)
    unresolved_requirements: list[str] = Field(default_factory=list)
    eligibility: str = "확인 필요"
    summary: str = ""
    matched: list[str] = Field(default_factory=list)
    matched_conditions: list[str] = Field(default_factory=list)
    requirements: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    is_new: bool = False
    source_url: str | None = None
    attachments: list[BidAttachment] = Field(default_factory=list)
    raw_data: dict = Field(default_factory=dict)


class CompanyProfileInput(CamelModel):
    name: str = Field(default="", max_length=120)
    location: str = Field(default="", max_length=120)
    size: str = Field(default="", max_length=40)
    licenses: list[str] = Field(default_factory=list, max_length=50)
    technologies: list[str] = Field(default_factory=list, max_length=50)
    business_areas: list[str] = Field(default_factory=list, max_length=50)
    experiences: list[str] = Field(default_factory=list, max_length=50)
    preferred_max_budget: int | None = Field(default=None, ge=0)
    service_regions: list[str] = Field(default_factory=list, max_length=50)
    service_agency_types: list[str] = Field(default_factory=list, max_length=20)
    excluded_business_areas: list[str] = Field(default_factory=list, max_length=50)
    completion: int = Field(default=0, ge=0, le=100)


class SearchRequest(CamelModel):
    category: str | None = None
    region: str | None = None
    min_budget: int | None = None
    max_budget: int | None = None
    include_keywords: list[str] = Field(default_factory=list)
    exclude_keywords: list[str] = Field(default_factory=list)
    demand_agencies: list[str] = Field(default_factory=list, max_length=20)
    only_eligible: bool = False
    eligibility_mode: Literal["not_eligible"] | None = None
    closing_within_days: int | None = None
    sort_mode: Literal["opportunity", "latest"] | None = None
    semantic_query: str = ""
    company_profile: CompanyProfileInput | None = None
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=200)


class QueryPlan(CamelModel):
    hard_filters: dict = Field(default_factory=dict)
    keywords: dict = Field(default_factory=dict)
    semantic_query: str = ""
    interpreted_conditions: list[str] = Field(default_factory=list)
    semantic_conditions: list[dict] = Field(default_factory=list)
    semantic_engine: str = ""
    search_id: str = ""
    search_trace: list[str] = Field(default_factory=list)
    elapsed_ms: int = 0
    search_fingerprint: str = ""
    feedback_applied: bool = False
    feedback_enabled: bool = True
    versions: dict[str, str | int] = Field(default_factory=dict)


class SearchResponse(CamelModel):
    query_plan: QueryPlan
    database_total: int
    total: int
    eligible_total: int
    closing_soon_total: int
    average_score: int
    items: list[BidRecord]


class FeedbackRequest(CamelModel):
    search_id: str = Field(min_length=1, max_length=80)
    bid_id: str = Field(min_length=1, max_length=160)
    feedback_type: str = Field(pattern="^(positive|negative|exclude|clear)$")
    reason: str = Field(default="", max_length=80)
    reasons: list[str] = Field(default_factory=list, max_length=9)
    condition_ids: list[str] = Field(default_factory=list, max_length=30)
    source: str = Field(default="detail", pattern="^(favorite|detail)$")


class FeedbackResponse(CamelModel):
    accepted: bool
    feedback_type: str
    message: str
    expires_in_seconds: int
