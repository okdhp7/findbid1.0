from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.bid import BidNotice
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
        for record in records:
            values = record.model_dump(by_alias=False)
            model = self.session.get(BidNotice, record.id)
            if model is None:
                self.session.add(BidNotice(**values))
                continue
            for key, value in values.items():
                setattr(model, key, value)
        self.session.commit()
        return len(records)

    def search(self, request: SearchRequest) -> list[BidRecord]:
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
        includes = [word.strip().lower() for word in request.include_keywords if word.strip()]
        excludes = [word.strip().lower() for word in request.exclude_keywords if word.strip()]
        results: list[BidRecord] = []

        for model in models:
            record = self.to_record(model)
            corpus = " ".join(
                [record.title, record.summary, *record.tags, *record.matched]
            ).lower()
            if includes and not any(word in corpus for word in includes):
                continue
            if any(word in corpus for word in excludes):
                continue
            results.append(record)

        return sorted(results, key=lambda item: item.score, reverse=True)[: request.limit]
