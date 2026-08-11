import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin, agent, bids, company, feedback, health, insights, notifications, search
from app.data import DEMO_BIDS
from app.database import SessionLocal, initialize_database
from app.repositories import BidRepository
from app.services.demand_agency_sync import demand_agency_sync_manager
from findbid_shared.config import get_settings
from findbid_shared.schemas import BidRecord

logger = logging.getLogger(__name__)


async def run_demand_agency_daily_check() -> None:
    settings = get_settings()
    await asyncio.sleep(5)
    first_check = True
    while True:
        try:
            await asyncio.to_thread(
                demand_agency_sync_manager().start_if_due,
                "startup" if first_check else "scheduled",
            )
        except Exception:
            logger.exception("수요기관 일일 동기화 확인 중 오류가 발생했습니다.")
        first_check = False
        await asyncio.sleep(max(300, settings.demand_agency_sync_check_seconds))


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    if get_settings().demo_mode:
        with SessionLocal() as session:
            repository = BidRepository(session)
            if repository.count() == 0:
                repository.upsert_many([BidRecord.model_validate(item) for item in DEMO_BIDS])
    settings = get_settings()
    agency_sync_task = None
    if settings.demand_agency_sync_enabled and (
        settings.g2b_api_key or settings.g2b_service_key
    ):
        agency_sync_task = asyncio.create_task(run_demand_agency_daily_check())
    try:
        yield
    finally:
        if agency_sync_task is not None:
            agency_sync_task.cancel()
            with suppress(asyncio.CancelledError):
                await agency_sync_task


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
