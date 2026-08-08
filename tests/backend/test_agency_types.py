from app.agency_types import (
    list_agency_type_details,
    resolve_demand_agency_filters,
    suggest_top_level_agencies,
)


class FakeSession:
    def execute(self, _statement):
        return FakeResult([
            ("공기업", "산하기관", "한국가스공사", 3),
            ("공기업", "산하기관", "인천국제공항공사", 3),
            ("공기업", "산하기관", "한국공항공사", 3),
            ("교육기관", "유치원", "경기도교육청", 1),
            ("분류 외 기관", "기타", "표시하지 않을 기관", 1),
        ])


class FakeResult(list):
    def all(self):
        return self


def test_agency_type_details_include_two_sample_names_and_count() -> None:
    result = list_agency_type_details(FakeSession())

    assert result == [
        {
            "name": "공기업",
            "details": [
                {
                    "name": "산하기관",
                    "topLevelAgencyNames": [
                        "한국가스공사",
                        "인천국제공항공사",
                    ],
                    "topLevelAgencyCount": 3,
                }
            ],
        },
        {
            "name": "교육기관",
            "details": [
                {
                    "name": "유치원",
                    "topLevelAgencyNames": ["경기도교육청"],
                    "topLevelAgencyCount": 1,
                }
            ],
        },
    ]


class SuggestionSession:
    def __init__(self):
        self.params = {}

    def execute(self, _statement, params):
        self.params = params
        return FakeResult([
            ("123", "경기도교육청", "123", "경기도교육청", 84, True),
            (
                "789",
                "경기도교육청 경기도고양교육지원청",
                "123",
                "경기도교육청",
                0,
                False,
            ),
        ])


def test_top_level_agency_suggestions_prioritize_normalized_query() -> None:
    session = SuggestionSession()

    result = suggest_top_level_agencies(session, " 경기 도 ", 50)

    assert session.params == {
        "contains": "%경기도%",
        "exact": "경기도",
        "prefix": "경기도%",
        "limit": 50,
    }
    assert result == [
        {
            "agencyCode": "123",
            "agencyName": "경기도교육청",
            "topLevelAgencyCode": "123",
            "topLevelAgencyName": "경기도교육청",
            "agencyCount": 84,
            "bidCount": 0,
            "isTopLevel": True,
        },
        {
            "agencyCode": "789",
            "agencyName": "경기도교육청 경기도고양교육지원청",
            "topLevelAgencyCode": "123",
            "topLevelAgencyName": "경기도교육청",
            "agencyCount": 0,
            "bidCount": 0,
            "isTopLevel": False,
        },
    ]


def test_agency_suggestions_count_only_open_unexpired_bids() -> None:
    class BidSession:
        def execute(self, statement, _params):
            sql = str(statement)
            assert "coalesce(status, 'open') = 'open'" in sql
            assert "deadline IS NULL OR deadline >= now()" in sql
            return FakeResult([])

    suggest_top_level_agencies(
        SuggestionSession(),
        "경기도",
        bid_session=BidSession(),
    )


class DemandAgencySession:
    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc_value, _traceback):
        return False

    def execute(self, _statement, _params):
        return FakeResult([
            ("순천향대학교산학협력단", "순천향대학교"),
        ])


def test_top_level_agency_filter_includes_agency_itself_and_children(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "app.agency_types.SessionLocal",
        lambda: DemandAgencySession(),
    )

    expanded, direct = resolve_demand_agency_filters([
        "순천향대학교",
        "한국소비자원",
    ])

    assert expanded == [
        "순천향대학교",
        "순천향대학교산학협력단",
    ]
    assert direct == ["한국소비자원"]
