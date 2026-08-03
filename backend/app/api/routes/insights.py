from __future__ import annotations

from datetime import datetime
from time import monotonic
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_bid_session
from app.market_insights import KOREA_TIMEZONE, build_market_insights, months_ago
from app.repositories import ExternalBidRepository


router = APIRouter(tags=["인사이트"])
MARKET_CACHE_SECONDS = 600
market_cache: dict[int, tuple[float, dict[str, Any]]] = {}


@router.get("/insights/market")
def market_insights(
    months: int = Query(default=6, ge=1, le=24),
    session: Session = Depends(get_bid_session),
) -> dict[str, Any]:
    cached = market_cache.get(months)
    if cached and cached[0] > monotonic():
        return cached[1]

    repository = ExternalBidRepository(session)
    period_end = datetime.now(KOREA_TIMEZONE)
    period_start = months_ago(period_end, months).replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )
    statement = text(
        f"""
        SELECT DISTINCT ON (b.bid_number)
            b.bid_number, b.bid_type, b.title, b.category, b.sub_category,
            b.detail_category, b.item_group_name, b.region_name,
            b.contract_method, b.estimated_price, b.budget_amount,
            b.base_price, b.required_licenses, b.announce_date, b.status
        FROM {repository.table_name} AS b
        WHERE b.announce_date >= :period_start
          AND b.announce_date <= :period_end
          AND lower(coalesce(b.status, '')) NOT IN (
              'cancelled', 'canceled', 'deleted', '취소', '삭제'
          )
        ORDER BY b.bid_number, b.announce_date DESC NULLS LAST, b.id DESC
        """
    )
    rows = [
        dict(row)
        for row in session.execute(
            statement,
            {"period_start": period_start, "period_end": period_end},
        ).mappings().all()
    ]
    result = build_market_insights(rows, period_start, period_end)
    market_cache[months] = (monotonic() + MARKET_CACHE_SECONDS, result)
    return result
