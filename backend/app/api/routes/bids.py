from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_session
from app.eligibility import evaluate_eligibility
from app.repositories import BidRepository
from findbid_shared.schemas import BidRecord

router = APIRouter(tags=["입찰공고"])


@router.get("/bids/{bid_id}", response_model=BidRecord, response_model_by_alias=True)
def get_bid(bid_id: str, session: Session = Depends(get_session)) -> BidRecord:
    bid = BidRepository(session).get(bid_id)
    if bid is None:
        raise HTTPException(status_code=404, detail="입찰공고를 찾을 수 없습니다.")
    return bid


@router.get("/bids/{bid_id}/eligibility")
def check_eligibility(bid_id: str, session: Session = Depends(get_session)) -> dict:
    bid = BidRepository(session).get(bid_id)
    if bid is None:
        raise HTTPException(status_code=404, detail="입찰공고를 찾을 수 없습니다.")
    return evaluate_eligibility(bid)
