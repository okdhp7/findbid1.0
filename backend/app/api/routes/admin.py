from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_session
from app.feedback import feedback_store
from app.repositories import ActivityLogRepository, BidRepository
from app.repositories.notification_repository import NotificationRepository
from findbid_shared.config import get_settings
from findbid_shared.schemas import BidRecord

router = APIRouter(tags=["내부 수집"])


class FeedbackSettingsUpdate(BaseModel):
    feedback_enabled: bool


class NotificationWrite(BaseModel):
    publisher: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=4000)

    @field_validator("publisher", "content")
    @classmethod
    def strip_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("내용을 입력해 주세요.")
        return cleaned


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


@router.get("/admin/activity-logs")
def activity_logs(
    log_type: Literal["users", "searches", "feedback"] = Query(
        default="users", alias="type"
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=15, alias="pageSize", ge=1, le=100),
    x_internal_key: str = Header(default=""),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    require_internal_key(x_internal_key)
    return ActivityLogRepository(session).admin_overview(log_type, page, page_size)


@router.delete("/admin/activity-users/{session_hash}", status_code=204)
def delete_activity_user(
    session_hash: str,
    x_internal_key: str = Header(default=""),
    session: Session = Depends(get_session),
) -> None:
    require_internal_key(x_internal_key)
    if len(session_hash) != 64 or not ActivityLogRepository(session).delete_user_activity(
        session_hash
    ):
        raise HTTPException(status_code=404, detail="사용자 활동기록을 찾을 수 없습니다.")


@router.get("/admin/notifications")
def list_admin_notifications(
    x_internal_key: str = Header(default=""),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    require_internal_key(x_internal_key)
    items = NotificationRepository(session).list(200)
    return {"items": items, "total": len(items)}


@router.post("/admin/notifications", status_code=201)
def create_notification(
    request: NotificationWrite,
    x_internal_key: str = Header(default=""),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    require_internal_key(x_internal_key)
    return NotificationRepository(session).create(request.publisher, request.content)


@router.put("/admin/notifications/{notification_id}")
def update_notification(
    notification_id: int,
    request: NotificationWrite,
    x_internal_key: str = Header(default=""),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    require_internal_key(x_internal_key)
    updated = NotificationRepository(session).update(
        notification_id, request.publisher, request.content
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="알림 게시물을 찾을 수 없습니다.")
    return updated


@router.delete("/admin/notifications/{notification_id}", status_code=204)
def delete_notification(
    notification_id: int,
    x_internal_key: str = Header(default=""),
    session: Session = Depends(get_session),
) -> None:
    require_internal_key(x_internal_key)
    if not NotificationRepository(session).delete(notification_id):
        raise HTTPException(status_code=404, detail="알림 게시물을 찾을 수 없습니다.")
