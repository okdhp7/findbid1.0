from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_session
from app.feedback import feedback_store
from findbid_shared.recommendation_versions import recommendation_versions

router = APIRouter(tags=["상태"])


@router.get("/health")
def health(session: Session = Depends(get_session)) -> dict:
    session.execute(text("SELECT 1"))
    try:
        feedback_store().redis.ping()
        redis_status = "정상"
    except Exception:
        redis_status = "오류"
    return {
        "status": "정상",
        "service": "FindBid Backend",
        "redis": redis_status,
        "versions": recommendation_versions(),
    }
