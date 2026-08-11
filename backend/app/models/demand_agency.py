from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DemandAgency(Base):
    __tablename__ = "demand_agencies"
    __table_args__ = (
        Index("ix_demand_agencies_top_level", "top_level_agency_code", "top_level_agency_name"),
        Index("ix_demand_agencies_type_details", "jurisdiction_type", "detail_type_large"),
    )

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(500), index=True)
    normalized_name: Mapped[str] = mapped_column(String(500), index=True)
    abbreviation: Mapped[str] = mapped_column(String(200), default="")
    jurisdiction_type: Mapped[str] = mapped_column(String(100), default="", index=True)
    detail_type_large: Mapped[str] = mapped_column(String(150), default="", index=True)
    detail_type_middle: Mapped[str] = mapped_column(String(150), default="", index=True)
    detail_type_small: Mapped[str] = mapped_column(String(150), default="", index=True)
    top_level_agency_code: Mapped[str] = mapped_column(String(20), default="", index=True)
    top_level_agency_name: Mapped[str] = mapped_column(String(500), default="", index=True)
    region_name: Mapped[str] = mapped_column(String(300), default="")
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    source_registered_at: Mapped[str] = mapped_column(String(30), default="")
    source_changed_at: Mapped[str] = mapped_column(String(30), default="")
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class DemandAgencySyncRun(Base):
    __tablename__ = "demand_agency_sync_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trigger: Mapped[str] = mapped_column(String(20), index=True)
    status: Mapped[str] = mapped_column(String(20), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    inquiry_start: Mapped[str] = mapped_column(String(12), default="")
    inquiry_end: Mapped[str] = mapped_column(String(12), default="")
    api_total: Mapped[int] = mapped_column(Integer, default=0)
    received_count: Mapped[int] = mapped_column(Integer, default=0)
    created_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, default=0)
    deleted_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str] = mapped_column(Text, default="")

