from __future__ import annotations

import time
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from findbid_shared.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

bid_engine = (
    create_engine(
        settings.bid_database_url,
        pool_pre_ping=True,
        connect_args={"options": "-c default_transaction_read_only=on"},
    )
    if settings.bid_database_url
    else engine
)
BidSessionLocal = sessionmaker(bind=bid_engine, autoflush=False, expire_on_commit=False)


def get_session() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session


def get_bid_session() -> Generator[Session, None, None]:
    with BidSessionLocal() as session:
        yield session


def initialize_database(retries: int = 20, interval_seconds: float = 1.5) -> None:
    from app.models.activity_log import (
        AdminActivityAuditLog,
        CompanyProfileSnapshot,
        RecommendationFeedbackLog,
        SearchActivityLog,
        UserActivitySession,
    )
    from app.models.bid import BidNotice
    from app.models.demand_agency import DemandAgency, DemandAgencySyncRun
    from app.models.notification import NotificationPost
    from app.models.semantic_embedding import BidSemanticEmbedding

    del (
        AdminActivityAuditLog,
        BidNotice,
        BidSemanticEmbedding,
        CompanyProfileSnapshot,
        DemandAgency,
        DemandAgencySyncRun,
        NotificationPost,
        RecommendationFeedbackLog,
        SearchActivityLog,
        UserActivitySession,
    )
    for attempt in range(1, retries + 1):
        try:
            Base.metadata.create_all(bind=engine)
            return
        except OperationalError:
            if attempt == retries:
                raise
            time.sleep(interval_seconds)
