from fastapi import APIRouter, Header, HTTPException

from app.feedback import feedback_store
from findbid_shared.schemas import FeedbackRequest, FeedbackResponse


router = APIRouter(tags=["추천 피드백"])


@router.post(
    "/feedback",
    response_model=FeedbackResponse,
    response_model_by_alias=True,
)
def submit_feedback(
    request: FeedbackRequest,
    x_session_id: str = Header(default="", alias="X-Session-ID"),
) -> FeedbackResponse:
    try:
        feedback_store().record_feedback(x_session_id, request)
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

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
