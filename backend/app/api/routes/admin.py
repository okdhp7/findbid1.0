from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_session
from app.feedback import feedback_store
from app.repositories import BidRepository
from findbid_shared.config import get_settings
from findbid_shared.schemas import BidRecord

router = APIRouter(tags=["내부 수집"])


class FeedbackSettingsUpdate(BaseModel):
    feedback_enabled: bool


def require_internal_key(value: str) -> None:
    if value != get_settings().internal_api_key:
        raise HTTPException(status_code=403, detail="내부 서비스 인증에 실패했습니다.")


@router.post("/admin/bids/import")
def import_bids(
    records: list[BidRecord],
    x_internal_key: str = Header(default=""),
    session: Session = Depends(get_session),
) -> dict:
    require_internal_key(x_internal_key)
    count = BidRepository(session).upsert_many(records)
    return {"imported": count}


@router.get("/admin/recommendation/status")
def recommendation_status(
    x_internal_key: str = Header(default=""),
) -> dict:
    require_internal_key(x_internal_key)
    return feedback_store().status()


@router.put("/admin/recommendation/feedback-settings")
def update_feedback_settings(
    request: FeedbackSettingsUpdate,
    x_internal_key: str = Header(default=""),
) -> dict[str, bool]:
    require_internal_key(x_internal_key)
    try:
        enabled = feedback_store().set_enabled(request.feedback_enabled)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return {"feedbackEnabled": enabled}
