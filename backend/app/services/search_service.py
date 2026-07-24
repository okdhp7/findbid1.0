from sqlalchemy.orm import Session

from app.repositories import BidRepository, ExternalBidRepository
from findbid_shared.config import get_settings
from findbid_shared.schemas.bid import QueryPlan, SearchRequest, SearchResponse


class SearchService:
    def __init__(self, session: Session):
        self.repository = (
            ExternalBidRepository(session)
            if get_settings().bid_database_url
            else BidRepository(session)
        )

    def search(self, request: SearchRequest) -> SearchResponse:
        if isinstance(self.repository, ExternalBidRepository):
            items, total, average_score = self.repository.search_with_metrics(request)
            database_total = self.repository.count_all()
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
            update={"closing_within_days": closing_days, "page": 1, "limit": 1}
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
            ),
            database_total=database_total,
            total=total,
            eligible_total=eligible_total,
            closing_soon_total=closing_soon_total,
            average_score=average_score,
            items=items,
        )
