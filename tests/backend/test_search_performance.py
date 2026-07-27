from app.repositories.external_bid_repository import ExternalBidRepository
from app.search_cache import _cache_key
from findbid_shared.schemas import BidRecord, SearchRequest


def _record(
    bid_id: str,
    *,
    score: int,
    eligibility: str,
    days_left: int,
    deadline_known: bool = True,
) -> BidRecord:
    return BidRecord(
        id=bid_id,
        notice_no=bid_id,
        category="용역",
        title=f"테스트 공고 {bid_id}",
        agency="테스트 기관",
        demand_agency="테스트 기관",
        close_at="2026.07.31 18:00" if deadline_known else "마감일 미정",
        days_left=days_left,
        score=score,
        eligibility=eligibility,
    )


def test_dashboard_metrics_reuse_one_ranked_result() -> None:
    repository = object.__new__(ExternalBidRepository)
    calls: list[SearchRequest] = []
    base_records = [
        _record("1", score=90, eligibility="참가 가능", days_left=2),
        _record("2", score=70, eligibility="참가 어려움", days_left=3),
        _record("3", score=50, eligibility="참가 가능", days_left=10),
        _record(
            "4",
            score=40,
            eligibility="참가 가능",
            days_left=0,
            deadline_known=False,
        ),
    ]

    def ranked(request: SearchRequest) -> list[BidRecord]:
        calls.append(request)
        return base_records

    repository._ranked_records = ranked
    request = SearchRequest(
        semantic_query="AI 웹서비스",
        closing_within_days=7,
        page=2,
        limit=20,
    )

    records, total, average, eligible, closing = (
        repository.search_with_dashboard_metrics(request)
    )

    assert [record.id for record in records] == ["1", "2"]
    assert total == 2
    assert average == 80
    assert eligible == 1
    assert closing == 2
    assert len(calls) == 1
    assert calls[0].only_eligible is False
    assert calls[0].closing_within_days is None
    assert calls[0].page == 1


def test_semantic_cache_key_is_shared_between_pages() -> None:
    first_page = SearchRequest(
        semantic_query="AI 웹서비스",
        page=1,
        limit=20,
    )
    second_page = first_page.model_copy(update={"page": 2})
    different_filter = first_page.model_copy(update={"region": "서울"})

    assert _cache_key(first_page) == _cache_key(second_page)
    assert _cache_key(first_page) != _cache_key(different_filter)


def test_semantic_cache_key_separates_company_profiles() -> None:
    first_profile = SearchRequest(
        semantic_query="AI 웹서비스",
        company_profile={
            "name": "첫 번째 기업",
            "location": "서울특별시",
            "technologies": ["React"],
            "completion": 80,
        },
    )
    second_profile = SearchRequest(
        semantic_query="AI 웹서비스",
        company_profile={
            "name": "두 번째 기업",
            "location": "부산광역시",
            "technologies": ["Python"],
            "completion": 90,
        },
    )

    assert _cache_key(first_profile) != _cache_key(second_profile)
