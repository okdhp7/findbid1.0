from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.agent import build_search_request
from app.database import get_session
from app.services import SearchService

router = APIRouter(tags=["AI Agent"])


class AgentSearchRequest(BaseModel):
    message: str = Field(min_length=2, max_length=2000)


@router.post("/agent/search")
def agent_search(payload: AgentSearchRequest, session: Session = Depends(get_session)) -> dict:
    request = build_search_request(payload.message)
    response = SearchService(session).search(request)
    return {
        "answer": f"입력한 의도를 분석해 적합한 공고 {response.total}건을 찾았습니다.",
        "queryPlan": response.query_plan.model_dump(by_alias=True),
        "items": [item.model_dump(by_alias=True) for item in response.items],
    }
