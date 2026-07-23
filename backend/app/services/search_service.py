from sqlalchemy.orm import Session

from app.repositories import BidRepository
from findbid_shared.schemas.bid import QueryPlan, SearchRequest, SearchResponse


class SearchService:
    def __init__(self, session: Session):
        self.repository = BidRepository(session)

    def search(self, request: SearchRequest) -> SearchResponse:
        items = self.repository.search(request)
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
            total=len(items),
            items=items,
        )
