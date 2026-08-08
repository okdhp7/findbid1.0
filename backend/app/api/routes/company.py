from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.agency_types import list_agency_type_details
from app.database import get_session
from app.eligibility.rules import COMPANY_PROFILE

router = APIRouter(tags=["기업"])


@router.get("/company/profile")
def company_profile() -> dict:
    return COMPANY_PROFILE


@router.get("/company/agency-types")
def company_agency_types(session: Session = Depends(get_session)) -> dict:
    return {"types": list_agency_type_details(session)}
