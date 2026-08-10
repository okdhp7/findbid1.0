from __future__ import annotations

import re

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.bid import BidNotice
from app.agency_types import normalize_agency_name, resolve_demand_agency_filters
from findbid_shared.schemas import BidRecord, SearchRequest


class BidRepository:
    def __init__(self, session: Session):
        self.session = session

    @staticmethod
    def to_record(model: BidNotice) -> BidRecord:
        return BidRecord.model_validate(
            {
                column.name: getattr(model, column.name)
                for column in BidNotice.__table__.columns
                if column.name not in {"created_at", "updated_at"}
            }
        )

    def count(self) -> int:
        return len(self.session.scalars(select(BidNotice.id)).all())

    def get(self, bid_id: str) -> BidRecord | None:
        model = self.session.get(BidNotice, bid_id)
        return self.to_record(model) if model else None

    def upsert_many(self, records: list[BidRecord]) -> int:
        model_columns = {
            column.name
            for column in BidNotice.__table__.columns
            if column.name not in {"created_at", "updated_at"}
        }
        for record in records:
            values = {
                key: value
                for key, value in record.model_dump(by_alias=False).items()
                if key in model_columns
            }
            model = self.session.get(BidNotice, record.id)
            if model is None:
                self.session.add(BidNotice(**values))
                continue
            for key, value in values.items():
                setattr(model, key, value)
        self.session.commit()
        return len(records)

    def _matching_records(self, request: SearchRequest) -> list[BidRecord]:
        statement = select(BidNotice)
        if request.category and request.category != "전체":
            statement = statement.where(BidNotice.category == request.category)
        if request.region and request.region != "전체 지역":
            statement = statement.where(
                or_(BidNotice.region == request.region, BidNotice.region == "전국")
            )
        if request.max_budget:
            statement = statement.where(BidNotice.budget <= request.max_budget)
        if request.only_eligible:
            statement = statement.where(BidNotice.eligibility == "참가 가능")
        if request.closing_within_days:
            statement = statement.where(BidNotice.days_left <= request.closing_within_days)

        models = self.session.scalars(statement).all()
        includes = [
            re.sub(r"\s+", "", word.lower())
            for word in request.include_keywords
            if word.strip()
        ]
        excludes = [
            re.sub(r"\s+", "", word.lower())
            for word in request.exclude_keywords
            if word.strip()
        ]
        child_agency_names, direct_agencies = resolve_demand_agency_filters(
            request.demand_agencies
        )
        child_agency_name_set = set(child_agency_names)
        results: list[BidRecord] = []

        for model in models:
            record = self.to_record(model)
            normalized_demand_agency = normalize_agency_name(record.demand_agency)
            if request.demand_agencies and not (
                normalized_demand_agency in child_agency_name_set
                or any(
                    agency in normalized_demand_agency
                    for agency in direct_agencies
                )
            ):
                continue
            corpus = " ".join(
                [record.title, record.summary, *record.tags, *record.matched]
            ).lower()
            normalized_keyword_corpus = re.sub(r"\s+", "", corpus)
            if includes and not any(word in normalized_keyword_corpus for word in includes):
                continue
            if any(word in normalized_keyword_corpus for word in excludes):
                continue
            results.append(record)

        return sorted(results, key=lambda item: item.score, reverse=True)

    def search(self, request: SearchRequest) -> list[BidRecord]:
        sorted_results = self._matching_records(request)
        start = (request.page - 1) * request.limit
        return sorted_results[start : start + request.limit]

    def count_search(self, request: SearchRequest) -> int:
        return len(self._matching_records(request))
