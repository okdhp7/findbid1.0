from __future__ import annotations

from datetime import datetime

from findbid_shared.schemas import BidRecord


def format_budget(value: int) -> str:
    if value <= 0:
        return "금액 미정"
    if value >= 100_000_000:
        billion = value // 100_000_000
        remainder = (value % 100_000_000) // 10_000
        return f"{billion}억 {remainder:,}만원" if remainder else f"{billion}억원"
    return f"{value // 10_000:,}만원"


def normalize_bid(item: dict, category: str) -> BidRecord:
    notice_no = str(item.get("bidNtceNo", "")).strip()
    notice_order = str(item.get("bidNtceOrd", "000")).strip()
    close_raw = str(item.get("bidClseDt", ""))
    close_at = close_raw
    days_left = 0
    if close_raw:
        try:
            close_date = datetime.fromisoformat(close_raw.replace(" ", "T"))
            days_left = max(0, (close_date - datetime.now()).days)
            close_at = close_date.strftime("%Y.%m.%d %H:%M")
        except ValueError:
            pass

    budget = int(float(item.get("presmptPrce") or item.get("asignBdgtAmt") or 0))
    notice_id = f"{notice_no}-{notice_order}" if notice_no else str(item.get("untyNtceNo", "unknown"))
    return BidRecord(
        id=notice_id,
        notice_no=notice_id,
        category=category,
        title=str(item.get("bidNtceNm", "제목 미확인")),
        agency=str(item.get("ntceInsttNm", "기관 미확인")),
        demand_agency=str(item.get("dminsttNm", item.get("ntceInsttNm", "기관 미확인"))),
        region=str(item.get("prtcptPsblRgnNm", "전국") or "전국"),
        budget=budget,
        budget_label=format_budget(budget),
        contract_method=str(item.get("cntrctCnclsMthdNm", "확인 필요")),
        award_method=str(item.get("sucsfbidMthdNm", "확인 필요")),
        close_at=close_at or "마감일 미확인",
        days_left=days_left,
        score=70,
        eligibility="확인 필요",
        summary=str(item.get("bidNtceNm", "")),
        tags=[category, str(item.get("bidMethdNm", ""))],
        is_new=True,
        source_url=item.get("bidNtceDtlUrl"),
        raw_data=item,
    )
