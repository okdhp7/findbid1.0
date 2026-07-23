from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_session
from app.services import SearchService
from findbid_shared.schemas import SearchRequest, SearchResponse

router = APIRouter(tags=["검색"])


@router.post("/search", response_model=SearchResponse, response_model_by_alias=True)
def search(request: SearchRequest, session: Session = Depends(get_session)) -> SearchResponse:
    return SearchService(session).search(request)
