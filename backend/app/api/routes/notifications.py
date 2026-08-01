from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_session
from app.repositories.notification_repository import NotificationRepository

router = APIRouter(tags=["알림"])


@router.get("/notifications")
def list_notifications(
    limit: int = Query(default=100, ge=1, le=200),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    items = NotificationRepository(session).list(limit)
    return {"items": items, "total": len(items)}
