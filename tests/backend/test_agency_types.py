from app.agency_types import list_agency_type_details


class FakeSession:
    def execute(self, _statement):
        return FakeResult([
            ("공기업", "산하기관", "(주)한국가스기술공사", 97),
            ("공기업", "산하기관", "국립공원공단 계룡산생태탐방원", 97),
            ("공기업", "산하기관", "그랜드코리아레저(주)", 97),
            ("교육기관", "유치원", "가람유치원", 451),
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
                    "agencyNames": [
                        "(주)한국가스기술공사",
                        "국립공원공단 계룡산생태탐방원",
                    ],
                    "agencyCount": 97,
                }
            ],
        },
        {
            "name": "교육기관",
            "details": [
                {
                    "name": "유치원",
                    "agencyNames": ["가람유치원"],
                    "agencyCount": 451,
                }
            ],
        },
    ]
