from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.eligibility.rules import COMPANY_PROFILE
from app.scoring import calculate_hybrid_score
from findbid_shared.config import get_settings
from findbid_shared.schemas import BidRecord, SearchRequest


KOREA_TIMEZONE = ZoneInfo("Asia/Seoul")
SAFE_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
REGION_PREFIXES = {
    "서울": ("서울특별시",),
    "부산": ("부산광역시",),
    "대구": ("대구광역시",),
    "인천": ("인천광역시",),
    "광주": ("광주광역시",),
    "대전": ("대전광역시",),
    "울산": ("울산광역시",),
    "세종": ("세종특별자치시",),
    "경기": ("경기도",),
    "강원": ("강원특별자치도", "강원도"),
    "충북": ("충청북도",),
    "충남": ("충청남도",),
    "전북": ("전북특별자치도", "전라북도"),
    "전남": ("전라남도",),
    "경북": ("경상북도",),
    "경남": ("경상남도",),
    "제주": ("제주특별자치도", "제주도"),
}


class ExternalBidRepository:
    """TPlan의 입찰공고 테이블을 쓰기 없이 조회하는 저장소."""

    def __init__(self, session: Session):
        self.session = session
        settings = get_settings()
        if not SAFE_IDENTIFIER.fullmatch(settings.bid_database_schema):
            raise ValueError("입찰공고 DB 스키마 이름이 올바르지 않습니다.")
        if not SAFE_IDENTIFIER.fullmatch(settings.bid_database_table):
            raise ValueError("입찰공고 DB 테이블 이름이 올바르지 않습니다.")
        self.table_name = (
            f'"{settings.bid_database_schema}"."{settings.bid_database_table}"'
        )

    @staticmethod
    def _budget_label(amount: int) -> str:
        if amount <= 0:
            return "금액 미정"
        billion, remainder = divmod(amount, 100_000_000)
        ten_thousand = remainder // 10_000
        if billion and ten_thousand:
            return f"{billion:,}억 {ten_thousand:,}만원"
        if billion:
            return f"{billion:,}억원"
        if ten_thousand:
            return f"{ten_thousand:,}만원"
        return f"{amount:,}원"

    @staticmethod
    def _category(row: dict[str, Any]) -> str:
        if row.get("category") in {"용역", "물품", "공사"}:
            return row["category"]
        return {
            "service": "용역",
            "goods": "물품",
            "construction": "공사",
        }.get(row.get("bid_type"), "용역")

    @staticmethod
    def _eligibility(row: dict[str, Any]) -> str:
        has_licenses = bool(row.get("required_licenses"))
        has_region_limit = bool((row.get("region_restriction") or "").strip())
        is_sme_only = bool(row.get("sme_only"))
        if not has_licenses and not has_region_limit and not is_sme_only:
            return "참가 가능"
        return "자격 확인 필요"

    @staticmethod
    def _region(region_name: str | None) -> str:
        if not region_name:
            return "전국"
        for short_name, prefixes in REGION_PREFIXES.items():
            if region_name.startswith(prefixes):
                return short_name
        return region_name

    @staticmethod
    def _days_left(deadline: datetime | None) -> int:
        if deadline is None:
            return 0
        now = datetime.now(timezone.utc)
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        return max(0, math.ceil((deadline - now).total_seconds() / 86_400))

    @staticmethod
    def _close_at(deadline: datetime | None) -> str:
        if deadline is None:
            return "마감일 미정"
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        return deadline.astimezone(KOREA_TIMEZONE).strftime("%Y.%m.%d %H:%M")

    @staticmethod
    def _keyword_list(request: SearchRequest) -> list[str]:
        words = [word.strip() for word in request.include_keywords if word.strip()]
        words.extend(
            word
            for word in re.split(r"[\s,，.]+", request.semantic_query.strip())
            if len(word) >= 2
        )
        return list(dict.fromkeys(words))

    def _to_record(
        self,
        row: dict[str, Any],
        request: SearchRequest | None = None,
    ) -> BidRecord:
        request = request or SearchRequest()
        budget = int(
            row.get("budget_amount")
            or row.get("estimated_price")
            or row.get("base_price")
            or 0
        )
        corpus = " ".join(
            str(row.get(key) or "")
            for key in (
                "title",
                "description",
                "category",
                "sub_category",
                "detail_category",
                "item_group_name",
            )
        ).lower()
        requirements = [
            *list(row.get("required_licenses") or []),
            *(
                [f"지역 제한: {row['region_restriction']}"]
                if row.get("region_restriction")
                else []
            ),
            *(["중소기업 제한"] if row.get("sme_only") else []),
        ]
        tags = list(
            dict.fromkeys(
                str(row[key])
                for key in (
                    "category",
                    "sub_category",
                    "detail_category",
                    "item_group_name",
                )
                if row.get(key)
            )
        )
        announce_date = row.get("announce_date")
        is_new = bool(
            announce_date
            and (
                datetime.now(timezone.utc)
                - (
                    announce_date
                    if announce_date.tzinfo
                    else announce_date.replace(tzinfo=timezone.utc)
                )
            ).days
            <= 7
        )
        days_left = self._days_left(row.get("deadline"))
        hybrid_score = calculate_hybrid_score(
            corpus=corpus,
            budget=budget,
            days_left=days_left,
            deadline_known=row.get("deadline") is not None,
            is_new=is_new,
            required_licenses=[
                str(value) for value in (row.get("required_licenses") or [])
            ],
            region_restriction=str(row.get("region_restriction") or ""),
            sme_only=bool(row.get("sme_only")),
            request=request,
            company_profile=COMPANY_PROFILE,
        )

        return BidRecord.model_validate(
            {
                "id": str(row["bid_number"]),
                "notice_no": str(row["bid_number"]),
                "category": self._category(row),
                "title": row["title"],
                "agency": row.get("noticer_name")
                or row.get("agency_name")
                or "기관 미정",
                "demand_agency": row.get("agency_name")
                or row.get("noticer_name")
                or "기관 미정",
                "region": self._region(row.get("region_name")),
                "budget": budget,
                "budget_label": self._budget_label(budget),
                "contract_method": row.get("contract_method") or "확인 필요",
                "award_method": row.get("winner_choice_method") or "확인 필요",
                "close_at": self._close_at(row.get("deadline")),
                "days_left": days_left,
                "score": hybrid_score.score,
                "score_confidence": hybrid_score.confidence,
                "score_breakdown": hybrid_score.breakdown,
                "score_reasons": hybrid_score.reasons,
                "unresolved_requirements": hybrid_score.unresolved_requirements,
                "eligibility": hybrid_score.eligibility,
                "summary": (row.get("description") or "")[:1000],
                "matched": hybrid_score.matched,
                "requirements": requirements,
                "risks": hybrid_score.unresolved_requirements,
                "tags": tags,
                "is_new": is_new,
                "source_url": row.get("source_url"),
                "raw_data": {
                    "externalId": row.get("id"),
                    "bidType": row.get("bid_type"),
                    "announceDate": (
                        announce_date.isoformat() if announce_date else None
                    ),
                    "openDate": (
                        row["open_date"].isoformat()
                        if row.get("open_date")
                        else None
                    ),
                },
            }
        )

    @staticmethod
    def _columns() -> str:
        return """
            b.id, b.bid_number, b.bid_type, b.title, b.description,
            b.category, b.sub_category, b.detail_category, b.estimated_price,
            b.budget_amount, b.base_price, b.contract_method, b.announce_date,
            b.deadline, b.open_date, b.required_licenses, b.region_restriction,
            b.sme_only, b.source_url, b.noticer_name, b.agency_name,
            b.region_name, b.item_group_name, b.winner_choice_method
        """

    @staticmethod
    def _corpus() -> str:
        return """
            lower(concat_ws(' ', b.title, b.description, b.category,
                b.sub_category, b.detail_category, b.item_group_name))
        """

    def get(self, bid_id: str) -> BidRecord | None:
        statement = text(
            f"""
            SELECT {self._columns()}
            FROM {self.table_name} AS b
            WHERE b.bid_number = :bid_id OR CAST(b.id AS text) = :bid_id
            LIMIT 1
            """
        )
        row = self.session.execute(statement, {"bid_id": bid_id}).mappings().first()
        return self._to_record(dict(row)) if row else None

    def count_all(self) -> int:
        statement = text(f"SELECT count(*) FROM {self.table_name}")
        return int(self.session.execute(statement).scalar_one())

    def _search_parts(
        self,
        request: SearchRequest,
    ) -> tuple[list[str], dict[str, Any], str]:
        conditions = [
            "coalesce(b.status, 'open') = 'open'",
            "(b.deadline IS NULL OR b.deadline >= now())",
        ]
        params: dict[str, Any] = {}
        order_by = "b.announce_date DESC NULLS LAST, b.id DESC"

        if request.category and request.category != "전체":
            conditions.append("b.category = :category")
            params["category"] = request.category
        if request.region and request.region != "전체 지역":
            region_conditions = ["b.region_name IS NULL"]
            prefixes = REGION_PREFIXES.get(request.region, (request.region,))
            for index, prefix in enumerate(prefixes):
                name = f"region_prefix_{index}"
                region_conditions.append(f"b.region_name LIKE :{name}")
                params[name] = f"{prefix}%"
            conditions.append(f"({' OR '.join(region_conditions)})")
            order_by = (
                "CASE WHEN b.region_name IS NULL THEN 1 ELSE 0 END, "
                + order_by
            )
        if request.max_budget:
            conditions.append(
                "coalesce(nullif(b.budget_amount, 0), "
                "nullif(b.estimated_price, 0), nullif(b.base_price, 0), 0)"
                " <= :max_budget"
            )
            params["max_budget"] = request.max_budget
        if request.closing_within_days:
            conditions.append(
                "b.deadline <= now() + make_interval(days => :closing_days)"
            )
            params["closing_days"] = request.closing_within_days

        includes = self._keyword_list(request)
        excludes = [word.strip() for word in request.exclude_keywords if word.strip()]
        corpus = self._corpus()
        if includes:
            keyword_conditions = []
            for index, word in enumerate(includes):
                name = f"include_{index}"
                keyword_conditions.append(f"{corpus} LIKE :{name}")
                params[name] = f"%{word.lower()}%"
            conditions.append(f"({' OR '.join(keyword_conditions)})")
        for index, word in enumerate(excludes):
            name = f"exclude_{index}"
            conditions.append(f"{corpus} NOT LIKE :{name}")
            params[name] = f"%{word.lower()}%"

        return conditions, params, order_by

    def _ranked_records(self, request: SearchRequest) -> list[BidRecord]:
        conditions, params, order_by = self._search_parts(request)
        statement = text(
            f"""
            SELECT {self._columns()}
            FROM {self.table_name} AS b
            WHERE {' AND '.join(conditions)}
            ORDER BY {order_by}
            """
        )
        rows = self.session.execute(statement, params).mappings().all()
        records = [self._to_record(dict(row), request) for row in rows]
        if request.only_eligible:
            records = [
                record for record in records if record.eligibility == "참가 가능"
            ]
        return sorted(records, key=lambda item: item.score, reverse=True)

    def search_with_metrics(
        self,
        request: SearchRequest,
    ) -> tuple[list[BidRecord], int, int]:
        ranked_records = self._ranked_records(request)
        total = len(ranked_records)
        average_score = (
            round(sum(record.score for record in ranked_records) / total)
            if total
            else 0
        )
        start = (request.page - 1) * request.limit
        return (
            ranked_records[start : start + request.limit],
            total,
            average_score,
        )

    def search_with_total(
        self,
        request: SearchRequest,
    ) -> tuple[list[BidRecord], int]:
        records, total, _ = self.search_with_metrics(request)
        return records, total

    def search(self, request: SearchRequest) -> list[BidRecord]:
        records, _ = self.search_with_total(request)
        return records

    def count_search(self, request: SearchRequest) -> int:
        if request.only_eligible:
            return len(self._ranked_records(request))
        conditions, params, _ = self._search_parts(request)
        statement = text(
            f"""
            SELECT count(*)
            FROM {self.table_name} AS b
            WHERE {' AND '.join(conditions)}
            """
        )
        return int(self.session.execute(statement, params).scalar_one())
