from datetime import datetime

from sqlalchemy import DateTime, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BidSemanticEmbedding(Base):
    __tablename__ = "bid_semantic_embeddings"

    bid_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    model_name: Mapped[str] = mapped_column(String(200), primary_key=True)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    vector: Mapped[list[float]] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
