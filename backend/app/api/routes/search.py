from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.database import get_bid_session
from app.services import SearchService
from findbid_shared.schemas import SearchRequest, SearchResponse

router = APIRouter(tags=["검색"])


@router.post("/search", response_model=SearchResponse, response_model_by_alias=True)
def search(
    request: SearchRequest,
    session: Session = Depends(get_bid_session),
    x_session_id: str = Header(default="", alias="X-Session-ID"),
) -> SearchResponse:
    return SearchService(session).search(request, session_id=x_session_id)
