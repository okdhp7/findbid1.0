from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_session
from app.repositories import BidRepository
from findbid_shared.config import get_settings
from findbid_shared.schemas import BidRecord

router = APIRouter(tags=["내부 수집"])


@router.post("/admin/bids/import")
def import_bids(
    records: list[BidRecord],
    x_internal_key: str = Header(default=""),
    session: Session = Depends(get_session),
) -> dict:
    if x_internal_key != get_settings().internal_api_key:
        raise HTTPException(status_code=403, detail="내부 서비스 인증에 실패했습니다.")
    count = BidRepository(session).upsert_many(records)
    return {"imported": count}
