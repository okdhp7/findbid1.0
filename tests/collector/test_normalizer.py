from collector.normalizers import normalize_bid


def test_g2b_item_is_normalized() -> None:
    record = normalize_bid(
        {
            "bidNtceNo": "R26BK00000001",
            "bidNtceOrd": "000",
            "bidNtceNm": "AI 플랫폼 구축",
            "ntceInsttNm": "조달청",
            "dminsttNm": "테스트 수요기관",
            "presmptPrce": "500000000",
            "bidClseDt": "2026-08-30 10:00:00",
            "cntrctCnclsMthdNm": "제한경쟁",
        },
        "용역",
    )

    assert record.notice_no == "R26BK00000001-000"
    assert record.title == "AI 플랫폼 구축"
    assert record.budget == 500_000_000
    assert record.budget_label == "5억원"
