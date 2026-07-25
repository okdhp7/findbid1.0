from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.semantic_embedding import BidSemanticEmbedding


class SemanticEmbeddingRepository:
    def __init__(self, session: Session, model_name: str):
        self.session = session
        self.model_name = model_name

    def find_valid(
        self,
        content_hashes: dict[str, str],
    ) -> dict[str, list[float]]:
        if not content_hashes:
            return {}
        statement = select(BidSemanticEmbedding).where(
            BidSemanticEmbedding.model_name == self.model_name,
            BidSemanticEmbedding.bid_id.in_(content_hashes),
        )
        records = self.session.scalars(statement).all()
        return {
            record.bid_id: [float(value) for value in record.vector]
            for record in records
            if record.content_hash == content_hashes.get(record.bid_id)
        }

    def upsert_many(
        self,
        values: list[tuple[str, str, list[float]]],
    ) -> None:
        for bid_id, content_hash, vector in values:
            self.session.merge(
                BidSemanticEmbedding(
                    bid_id=bid_id,
                    model_name=self.model_name,
                    content_hash=content_hash,
                    vector=vector,
                )
            )
        self.session.commit()
