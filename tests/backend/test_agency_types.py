from app.agency_types import list_agency_type_details


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
