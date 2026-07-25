import json
import logging
from time import perf_counter
from uuid import uuid4

from sqlalchemy.orm import Session

from app.agent.orchestrator import describe_search_intent
from app.knowledge import analyze_query
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

logger = logging.getLogger("uvicorn.error")


class SearchService:
    def __init__(self, session: Session):
        self.repository = (
            ExternalBidRepository(session)
            if get_settings().bid_database_url
            else BidRepository(session)
        )

    def search(self, request: SearchRequest) -> SearchResponse:
        started_at = perf_counter()
        search_id = uuid4().hex[:12]
        analysis = analyze_query(request.semantic_query)
        trace: list[str] = [
            f"검색 시작: {request.semantic_query or '상세조건 검색'}",
            f"문장 정규화: {analysis.normalized_query or '없음'}",
        ]
        entity_labels = list(
            dict.fromkeys(
                f"{entity.domain}={entity.canonical}"
                for entity in analysis.entities
                if entity.domain not in {
                    "검색 명령 표현",
                    "제외 의도",
                }
            )
        )
        trace.append(
            "개체 추출: "
            + (", ".join(entity_labels) if entity_labels else "없음")
        )
        region_entities = [
            entity
            for entity in analysis.entities
            if entity.domain == "지역"
        ]
        if region_entities:
            trace.append(
                "지역 지식 그래프: "
                + ", ".join(
                    f"{entity.canonical} → {'·'.join(entity.values)}"
                    for entity in region_entities
                )
            )
            trace.append(
                "지역 적용 방식: "
                + (
                    "참가 지역 필터"
                    if analysis.participant_regions
                    else "발주기관·수요기관 우선순위"
                )
            )

        cache_hit = False
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
                    cache_hit = True
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
                trace.extend(self.repository.last_search_trace)
            else:
                trace.append("검색 결과 캐시: 적중")

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

        trace.append(f"최종 결과: {total:,}건")
        elapsed_ms = round((perf_counter() - started_at) * 1000)
        trace.append(f"처리시간: {elapsed_ms:,}ms")
        settings = get_settings()
        if settings.search_trace_enabled:
            logger.info(
                "검색 추적 %s",
                json.dumps(
                    {
                        "searchId": search_id,
                        "query": request.semantic_query[:500],
                        "cacheHit": cache_hit,
                        "total": total,
                        "elapsedMs": elapsed_ms,
                        "trace": trace,
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
            )
        else:
            trace = ["검색 추적 로그가 비활성화되어 있습니다."]

        return SearchResponse(
            query_plan=QueryPlan(
                hard_filters={
                    "category": request.category or "전체",
                    "region": request.region or "전체 지역",
                    "minBudget": request.min_budget,
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
                search_id=search_id,
                search_trace=trace,
                elapsed_ms=elapsed_ms,
            ),
            database_total=database_total,
            total=total,
            eligible_total=eligible_total,
            closing_soon_total=closing_soon_total,
            average_score=average_score,
            items=items,
        )
