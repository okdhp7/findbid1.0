from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.agency_types import list_agency_type_details, suggest_top_level_agencies
from app.database import get_bid_session, get_session
from app.eligibility.rules import COMPANY_PROFILE
from app.repositories import ActivityLogRepository
from findbid_shared.schemas import CompanyProfileInput

router = APIRouter(tags=["기업"])


@router.get("/company/profile")
def company_profile() -> dict:
    return COMPANY_PROFILE


@router.post("/company/profile")
def save_company_profile(
    request: CompanyProfileInput,
    x_session_id: str = Header(default="", alias="X-Session-ID"),
    x_client_ip: str = Header(default="", alias="X-Client-IP"),
    x_client_user_agent: str = Header(default="", alias="X-Client-User-Agent"),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    if not x_session_id.strip():
        raise HTTPException(status_code=400, detail="사용자 세션을 확인할 수 없습니다.")
    ActivityLogRepository(session).record_profile(
        x_session_id,
        request,
        ip_address=x_client_ip,
        user_agent=x_client_user_agent,
    )
    return {"saved": True}


@router.get("/company/agency-types")
def company_agency_types(session: Session = Depends(get_session)) -> dict:
    return {"types": list_agency_type_details(session)}


@router.get("/company/agency-suggestions")
def company_agency_suggestions(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=10, ge=1, le=100),
    session: Session = Depends(get_session),
    bid_session: Session = Depends(get_bid_session),
) -> dict:
    suggestions = suggest_top_level_agencies(
        session,
        q,
        min(limit + 1, 101),
        bid_session=bid_session,
    )
    return {
        "items": suggestions[:limit],
        "hasMore": len(suggestions) > limit,
    }
