from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models.activity_log import (
    AdminActivityAuditLog,
    RecommendationFeedbackLog,
    SearchActivityLog,
    UserActivitySession,
)
from app.repositories.activity_log_repository import ActivityLogRepository


def test_admin_activity_logs_are_paginated_by_type() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            UserActivitySession.__table__,
            SearchActivityLog.__table__,
            RecommendationFeedbackLog.__table__,
        ],
    )
    base_time = datetime(2026, 8, 10, tzinfo=timezone.utc)

    with Session(engine) as session:
        for index in range(32):
            session_hash = f"{index:064d}"
            created_at = base_time + timedelta(minutes=index)
            session.add(UserActivitySession(
                session_hash=session_hash,
                session_label=f"익명-{index:08d}",
                first_seen_at=created_at,
                last_seen_at=created_at,
            ))
            session.add(SearchActivityLog(
                search_id=f"search-{index}",
                session_hash=session_hash,
                trigger="ai_button",
                search_fingerprint=f"fingerprint-{index}",
                request_data={},
                result_summary={},
                created_at=created_at,
            ))
            session.add(RecommendationFeedbackLog(
                search_id=f"search-{index}",
                session_hash=session_hash,
                bid_id=f"bid-{index}",
                feedback_type="positive",
                reasons=[],
                condition_ids=[],
                source="detail",
                created_at=created_at,
            ))
        session.commit()

        repository = ActivityLogRepository(session)
        users = repository.admin_overview("users", page=2, page_size=15)
        searches = repository.admin_overview("searches", page=1, page_size=15)
        feedback = repository.admin_overview("feedback", page=3, page_size=15)

        assert users["summary"] == {"users": 32, "searches": 32, "feedback": 32}
        assert users["pagination"] == {
            "type": "users",
            "page": 2,
            "pageSize": 15,
            "total": 32,
            "totalPages": 3,
        }
        assert len(users["users"]) == 15
        assert users["users"][0]["sessionLabel"] == "익명-00000016"
        assert users["searches"] == []
        assert len(searches["searches"]) == 15
        assert searches["searches"][0]["searchId"] == "search-31"
        assert len(feedback["feedback"]) == 2
        assert feedback["feedback"][0]["bidId"] == "bid-1"


def test_search_activity_logs_are_deleted_by_displayed_page_ids() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[SearchActivityLog.__table__, AdminActivityAuditLog.__table__],
    )
    with Session(engine) as session:
        for index in range(4):
            session.add(SearchActivityLog(
                search_id=f"page-delete-{index}",
                session_hash=f"{index:064d}",
                trigger="ai_button",
                search_fingerprint=f"fingerprint-{index}",
                request_data={},
                result_summary={},
            ))
        session.commit()
        logs = list(session.query(SearchActivityLog).order_by(SearchActivityLog.id))

        deleted_count = ActivityLogRepository(session).delete_search_activities(
            [logs[1].id, logs[2].id]
        )

        assert deleted_count == 2
        assert [item.search_id for item in session.query(SearchActivityLog).order_by(
            SearchActivityLog.id
        )] == ["page-delete-0", "page-delete-3"]
        audit = session.query(AdminActivityAuditLog).one()
        assert audit.action == "AI 검색이력 페이지 삭제"


def test_feedback_activity_logs_are_deleted_by_displayed_page_ids() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[RecommendationFeedbackLog.__table__, AdminActivityAuditLog.__table__],
    )
    with Session(engine) as session:
        for index in range(4):
            session.add(RecommendationFeedbackLog(
                search_id=f"feedback-delete-{index}",
                session_hash=f"{index:064d}",
                bid_id=f"bid-{index}",
                feedback_type="positive",
                reasons=[],
                condition_ids=[],
                source="detail",
            ))
        session.commit()
        logs = list(session.query(RecommendationFeedbackLog).order_by(
            RecommendationFeedbackLog.id
        ))

        deleted_count = ActivityLogRepository(session).delete_feedback_activities(
            [logs[0].id, logs[3].id]
        )

        assert deleted_count == 2
        assert [item.bid_id for item in session.query(RecommendationFeedbackLog).order_by(
            RecommendationFeedbackLog.id
        )] == ["bid-1", "bid-2"]
        audit = session.query(AdminActivityAuditLog).one()
        assert audit.action == "추천 피드백 페이지 삭제"

