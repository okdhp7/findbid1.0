from sqlalchemy.orm import Session

from app.agent.orchestrator import describe_search_intent
from app.repositories import BidRepository, ExternalBidRepository
from app.search_cache import (
    get_cached_semantic_search,
    set_cached_semantic_search,
)
from app.semantic import get_semantic_search_engine
from findbid_shared.config import get_settings
from findbid_shared.schemas.bid import (
    BidRecord,
    QueryPlan,
    SearchRequest,
    SearchResponse,
)


class SearchService:
    def __init__(self, session: Session):
        self.repository = (
            ExternalBidRepository(session)
            if get_settings().bid_database_url
            else BidRepository(session)
        )

    def search(self, request: SearchRequest) -> SearchResponse:
        if isinstance(self.repository, ExternalBidRepository):
            cached = get_cached_semantic_search(request)
            if cached:
                try:
                    records = [
                        BidRecord.model_validate(item)
                        for item in cached["records"]
                    ]
                    database_total = int(cached["databaseTotal"])
                    total = int(cached["total"])
                    eligible_total = int(cached["eligibleTotal"])
                    closing_soon_total = int(cached["closingSoonTotal"])
                    average_score = int(cached["averageScore"])
                except (KeyError, TypeError, ValueError):
                    cached = None

            if not cached:
                (
                    records,
                    total,
                    average_score,
                    eligible_total,
                    closing_soon_total,
                ) = self.repository.search_with_dashboard_metrics(request)
                database_total = self.repository.count_all()
                set_cached_semantic_search(
                    request,
                    {
                        "records": [
                            record.model_dump(mode="json", by_alias=True)
                            for record in records
                        ],
                        "databaseTotal": database_total,
                        "total": total,
                        "eligibleTotal": eligible_total,
                        "closingSoonTotal": closing_soon_total,
                        "averageScore": average_score,
                    },
                )

            start = (request.page - 1) * request.limit
            items = records[start : start + request.limit]
        else:
            items = self.repository.search(request)
            total = self.repository.count_search(request)
            database_total = self.repository.count()
            average_score = (
                round(sum(item.score for item in items) / len(items))
                if items
                else 0
            )
            eligible_request = request.model_copy(
                update={"only_eligible": True, "page": 1, "limit": 1}
            )
            closing_days = min(request.closing_within_days or 7, 7)
            closing_request = request.model_copy(
                update={
                    "closing_within_days": closing_days,
                    "page": 1,
                    "limit": 1,
                }
            )
            eligible_total = self.repository.count_search(eligible_request)
            closing_soon_total = self.repository.count_search(closing_request)

        return SearchResponse(
            query_plan=QueryPlan(
                hard_filters={
                    "category": request.category or "전체",
                    "region": request.region or "전체 지역",
                    "maxBudget": request.max_budget,
                    "onlyEligible": request.only_eligible,
                    "closingWithinDays": request.closing_within_days,
                },
                keywords={
                    "include": request.include_keywords,
                    "exclude": request.exclude_keywords,
                },
                semantic_query=request.semantic_query,
                interpreted_conditions=describe_search_intent(
                    request.semantic_query
                ),
                semantic_engine=(
                    get_semantic_search_engine().engine_name
                    if request.semantic_query.strip()
                    else ""
                ),
            ),
            database_total=database_total,
            total=total,
            eligible_total=eligible_total,
            closing_soon_total=closing_soon_total,
            average_score=average_score,
            items=items,
        )
