from fastapi import APIRouter

from app.eligibility.rules import COMPANY_PROFILE

router = APIRouter(tags=["기업"])


@router.get("/company/profile")
def company_profile() -> dict:
    return COMPANY_PROFILE
