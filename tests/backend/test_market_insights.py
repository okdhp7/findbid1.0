from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.market_insights import HOT_KEYWORD_LIMIT, build_market_insights, months_ago


KOREA_TIMEZONE = ZoneInfo("Asia/Seoul")


def _row(
    bid_number: str,
    title: str,
    announce_date: datetime,
    *,
    category: str = "용역",
    region: str = "경기도",
    budget: int = 300_000_000,
) -> dict:
    return {
        "bid_number": bid_number,
        "bid_type": "service",
        "title": title,
        "category": category,
        "sub_category": "정보화사업",
        "detail_category": "인공지능",
        "item_group_name": "AI 플랫폼",
        "region_name": region,
        "contract_method": "일반경쟁",
        "estimated_price": budget,
        "budget_amount": 0,
        "base_price": 0,
        "required_licenses": [],
        "announce_date": announce_date,
        "status": "open",
    }


def test_six_month_market_insight_includes_closed_period_rows() -> None:
    period_end = datetime(2026, 8, 3, 12, 0, tzinfo=KOREA_TIMEZONE)
    period_start = months_ago(period_end, 6)
    rows = [
        _row(
            "recent",
            "인공지능 시스템 도입 운영 단계",
            period_end - timedelta(days=10),
        ),
        _row(
            "closed",
            "인공지능 플랫폼 구축 용역",
            period_end - timedelta(days=120),
        ),
    ]

    result = build_market_insights(rows, period_start, period_end)

    assert result["total"] == 2
    assert result["periodStart"] == "2026-02-03"
    assert result["periodEnd"] == "2026-08-03"
    assert result["categoryBreakdown"] == [{"label": "용역", "count": 2}]
    assert result["keywordGroupCounts"]["all"]["all"] == 2


def test_general_words_are_excluded_from_hot_keywords() -> None:
    period_end = datetime(2026, 8, 3, 12, 0, tzinfo=KOREA_TIMEZONE)
    period_start = months_ago(period_end, 6)
    result = build_market_insights(
        [
            _row(
                "one",
                "인공지능 교육환경 학년도 3학년 구매 도입 운영 단계 조성 처리 수의 개소 지구 정비공사 설치공사 단가계약 위탁용역",
                period_end - timedelta(days=5),
            )
        ],
        period_start,
        period_end,
    )

    labels = {
        item["label"]
        for item in result["keywordGroups"]["all"]["all"]
    }
    assert "인공지능" in labels
    assert "교육환경" in labels
    assert not {
        "학년도",
        "학년",
        "구매",
        "도입",
        "운영",
        "단계",
        "조성",
        "처리",
        "수의",
        "개소",
        "지구",
        "정비공사",
        "설치공사",
        "단가계약",
        "위탁용역",
    }.intersection(labels)


def test_lightweight_model_prefers_core_terms_without_new_stopwords() -> None:
    period_end = datetime(2026, 8, 3, 12, 0, tzinfo=KOREA_TIMEZONE)
    period_start = months_ago(period_end, 6)
    generic_words = "분석 수립 유지관리 장비 기타 호선 환경개선 리모델링 시설"
    rows = []
    for index in range(12):
        row = _row(
            str(index),
            f"인공지능 보안 플랫폼 {generic_words}",
            period_end - timedelta(days=index + 1),
        )
        row.update(
            {
                "sub_category": "인공지능",
                "detail_category": "정보보안",
                "item_group_name": "AI 플랫폼",
            }
        )
        rows.append(row)

    result = build_market_insights(rows, period_start, period_end)
    labels = {
        item["label"]
        for item in result["keywordGroups"]["all"]["all"]
    }

    assert {"인공지능", "보안", "플랫폼"}.issubset(labels)
    assert not set(generic_words.split()).intersection(labels)
    assert result["keywordModel"] == {
        "name": "경량 비지도 핵심어 모델",
        "features": ["제목 위치", "분류 일치", "문맥 응집도"],
        "embeddingUsed": False,
    }


def test_months_ago_handles_month_end() -> None:
    value = datetime(2026, 8, 31, 12, 0, tzinfo=KOREA_TIMEZONE)

    assert months_ago(value, 6).date().isoformat() == "2026-02-28"


def test_hot_keyword_trend_returns_up_to_fifteen_items() -> None:
    period_end = datetime(2026, 8, 3, 12, 0, tzinfo=KOREA_TIMEZONE)
    period_start = months_ago(period_end, 6)
    rows = [
        _row(
            f"{keyword_index}-{repeat_index}",
            f"topic{keyword_index:02d}",
            period_end - timedelta(days=repeat_index + 1),
        )
        for keyword_index in range(20)
        for repeat_index in range(2)
    ]

    result = build_market_insights(rows, period_start, period_end)

    assert HOT_KEYWORD_LIMIT == 15
    assert len(result["keywordGroups"]["all"]["all"]) == HOT_KEYWORD_LIMIT


def test_reference_documents_are_excluded_from_market_demands() -> None:
    period_end = datetime(2026, 8, 3, 12, 0, tzinfo=KOREA_TIMEZONE)
    period_start = months_ago(period_end, 6)
    row = _row("one", "인공지능 플랫폼", period_end - timedelta(days=5))
    row.update(
        {
            "sub_category": "규격서 참조",
            "detail_category": "수요기관 규격",
            "item_group_name": "컴퓨터서버",
            "required_licenses": ["시방서참고", "사양서 참조"],
        }
    )

    result = build_market_insights([row], period_start, period_end)

    assert result["demands"] == [{"label": "컴퓨터서버", "count": 1}]
