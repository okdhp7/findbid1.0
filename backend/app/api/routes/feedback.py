import logging

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_session
from app.feedback import feedback_store
from app.repositories import ActivityLogRepository
from findbid_shared.schemas import FeedbackRequest, FeedbackResponse


router = APIRouter(tags=["추천 피드백"])
logger = logging.getLogger(__name__)


@router.post(
    "/feedback",
    response_model=FeedbackResponse,
    response_model_by_alias=True,
)
def submit_feedback(
    request: FeedbackRequest,
    x_session_id: str = Header(default="", alias="X-Session-ID"),
    x_client_ip: str = Header(default="", alias="X-Client-IP"),
    x_client_user_agent: str = Header(default="", alias="X-Client-User-Agent"),
    session: Session = Depends(get_session),
) -> FeedbackResponse:
    try:
        impression = feedback_store().record_feedback(x_session_id, request)
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    try:
        ActivityLogRepository(session).record_feedback(
            x_session_id,
            request,
            impression,
            ip_address=x_client_ip,
            user_agent=x_client_user_agent,
        )
    except Exception:
        session.rollback()
        logger.warning("추천 피드백을 DB 활동로그에 저장하지 못했습니다.", exc_info=True)

    messages = {
        "positive": "적합 피드백을 반영했습니다.",
        "negative": "부적합 피드백을 반영했습니다.",
        "exclude": "해당 공고를 현재 세션의 추천에서 제외했습니다.",
        "clear": "피드백을 취소했습니다.",
    }
    if request.source == "favorite":
        messages = {
            **messages,
            "positive": "관심공고 선택을 추천 가산점에 반영했습니다.",
            "clear": "관심공고에 따른 추천 가산점을 해제했습니다.",
        }
    return FeedbackResponse(
        accepted=True,
        feedback_type=request.feedback_type,
        message=messages[request.feedback_type],
        expires_in_seconds=feedback_store().ttl,
    )


@router.get("/feedback/settings")
def feedback_settings() -> dict[str, bool]:
    return {"feedbackEnabled": feedback_store().is_enabled()}
