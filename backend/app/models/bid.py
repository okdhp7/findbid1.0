from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BidNotice(Base):
    __tablename__ = "bid_notices"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    notice_no: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(500), index=True)
    agency: Mapped[str] = mapped_column(String(300))
    demand_agency: Mapped[str] = mapped_column(String(300), index=True)
    region: Mapped[str] = mapped_column(String(80), default="전국", index=True)
    budget: Mapped[int] = mapped_column(BigInteger, default=0, index=True)
    budget_label: Mapped[str] = mapped_column(String(80), default="금액 미정")
    contract_method: Mapped[str] = mapped_column(String(120), default="확인 필요")
    award_method: Mapped[str] = mapped_column(String(120), default="확인 필요")
    close_at: Mapped[str] = mapped_column(String(80))
    days_left: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[int] = mapped_column(Integer, default=70, index=True)
    eligibility: Mapped[str] = mapped_column(String(30), default="확인 필요", index=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    matched: Mapped[list] = mapped_column(JSON, default=list)
    requirements: Mapped[list] = mapped_column(JSON, default=list)
    risks: Mapped[list] = mapped_column(JSON, default=list)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    is_new: Mapped[bool] = mapped_column(Boolean, default=False)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
