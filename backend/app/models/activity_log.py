from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UserActivitySession(Base):
    __tablename__ = "user_activity_sessions"

    session_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_label: Mapped[str] = mapped_column(String(20), index=True)
    ip_hash: Mapped[str] = mapped_column(String(64), default="")
    user_agent: Mapped[str] = mapped_column(String(500), default="")
    current_company_profile: Mapped[dict] = mapped_column(JSON, default=dict)
    ai_search_count: Mapped[int] = mapped_column(Integer, default=0)
    feedback_count: Mapped[int] = mapped_column(Integer, default=0)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )


class CompanyProfileSnapshot(Base):
    __tablename__ = "company_profile_snapshots"
    __table_args__ = (
        UniqueConstraint("session_hash", "profile_hash", name="uq_profile_session_hash"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_hash: Mapped[str] = mapped_column(String(64), index=True)
    profile_hash: Mapped[str] = mapped_column(String(64), index=True)
    profile_data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class SearchActivityLog(Base):
    __tablename__ = "search_activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    search_id: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    session_hash: Mapped[str] = mapped_column(String(64), index=True)
    trigger: Mapped[str] = mapped_column(String(30), index=True)
    profile_snapshot_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    search_fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    request_data: Mapped[dict] = mapped_column(JSON, default=dict)
    result_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )


class RecommendationFeedbackLog(Base):
    __tablename__ = "recommendation_feedback_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    search_id: Mapped[str] = mapped_column(String(80), index=True)
    session_hash: Mapped[str] = mapped_column(String(64), index=True)
    bid_id: Mapped[str] = mapped_column(String(160), index=True)
    feedback_type: Mapped[str] = mapped_column(String(20), index=True)
    reasons: Mapped[list] = mapped_column(JSON, default=list)
    condition_ids: Mapped[list] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(20), default="detail")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )


class AdminActivityAuditLog(Base):
    __tablename__ = "admin_activity_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    target: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )
