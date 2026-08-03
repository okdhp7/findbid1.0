from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin, agent, bids, company, feedback, health, insights, notifications, search
from app.data import DEMO_BIDS
from app.database import SessionLocal, initialize_database
from app.repositories import BidRepository
from findbid_shared.config import get_settings
from findbid_shared.schemas import BidRecord


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    if get_settings().demo_mode:
        with SessionLocal() as session:
            repository = BidRepository(session)
            if repository.count() == 0:
                repository.upsert_many([BidRecord.model_validate(item) for item in DEMO_BIDS])
    yield


app = FastAPI(
    title="FindBid API",
    description="나라장터 입찰공고 검색과 기업 적합성 분석 API",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3100"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

prefix = "/api/v1"
app.include_router(health.router, prefix=prefix)
app.include_router(search.router, prefix=prefix)
app.include_router(feedback.router, prefix=prefix)
app.include_router(bids.router, prefix=prefix)
app.include_router(company.router, prefix=prefix)
app.include_router(agent.router, prefix=prefix)
app.include_router(admin.router, prefix=prefix)
app.include_router(notifications.router, prefix=prefix)
app.include_router(insights.router, prefix=prefix)
