import logging

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.database import get_bid_session, get_session
from app.repositories import ActivityLogRepository
from app.services import SearchService
from findbid_shared.schemas import SearchRequest, SearchResponse

router = APIRouter(tags=["검색"])
logger = logging.getLogger(__name__)


@router.post("/search", response_model=SearchResponse, response_model_by_alias=True)
def search(
    request: SearchRequest,
    bid_session: Session = Depends(get_bid_session),
    log_session: Session = Depends(get_session),
    x_session_id: str = Header(default="", alias="X-Session-ID"),
    x_client_ip: str = Header(default="", alias="X-Client-IP"),
    x_client_user_agent: str = Header(default="", alias="X-Client-User-Agent"),
) -> SearchResponse:
    response = SearchService(bid_session).search(request, session_id=x_session_id)
    if request.search_trigger == "ai_button":
        try:
            ActivityLogRepository(log_session).record_search(
                x_session_id,
                request,
                response,
                ip_address=x_client_ip,
                user_agent=x_client_user_agent,
            )
        except Exception:
            log_session.rollback()
            logger.warning("AI 검색 활동을 DB에 저장하지 못했습니다.", exc_info=True)
    return response
