import asyncio
import logging

import httpx

from collector.g2b import G2BClient
from collector.normalizers import normalize_bid
from findbid_shared.config import get_settings
from findbid_shared.constants import G2B_OPERATIONS

logger = logging.getLogger(__name__)


class CollectorScheduler:
    def __init__(self, interval_seconds: int = 600) -> None:
        self.interval_seconds = interval_seconds
        self.settings = get_settings()
        self.client = G2BClient()

    async def collect_once(self) -> int:
        if not self.settings.g2b_service_key:
            logger.info("나라장터 인증키가 없어 데모 모드로 대기합니다.")
            return 0
        records = []
        for category in G2B_OPERATIONS:
            raw_items = await self.client.fetch_recent(category)
            records.extend(normalize_bid(item, category) for item in raw_items)
        if not records:
            return 0
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self.settings.backend_internal_url}/api/v1/admin/bids/import",
                headers={"X-Internal-Key": self.settings.internal_api_key},
                json=[record.model_dump(by_alias=True) for record in records],
            )
            response.raise_for_status()
        logger.info("입찰공고 %s건을 수집했습니다.", len(records))
        return len(records)

    async def run_forever(self) -> None:
        while True:
            try:
                await self.collect_once()
            except Exception:
                logger.exception("나라장터 공고 수집 중 오류가 발생했습니다.")
            await asyncio.sleep(self.interval_seconds)
