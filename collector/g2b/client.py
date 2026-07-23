from __future__ import annotations

from datetime import datetime, timedelta

import httpx

from findbid_shared.config import get_settings
from findbid_shared.constants import G2B_BASE_URL, G2B_OPERATIONS


class G2BClient:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def fetch_recent(self, category: str, minutes: int = 30) -> list[dict]:
        if not self.settings.g2b_service_key:
            return []
        operation = G2B_OPERATIONS[category]
        end = datetime.now()
        begin = end - timedelta(minutes=minutes)
        params = {
            "serviceKey": self.settings.g2b_service_key,
            "numOfRows": 100,
            "pageNo": 1,
            "type": "json",
            "inqryDiv": 1,
            "inqryBgnDt": begin.strftime("%Y%m%d%H%M"),
            "inqryEndDt": end.strftime("%Y%m%d%H%M"),
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(f"{G2B_BASE_URL}/{operation}", params=params)
            response.raise_for_status()
            payload = response.json()
        items = payload.get("response", {}).get("body", {}).get("items", [])
        if isinstance(items, dict):
            items = items.get("item", [])
        return items if isinstance(items, list) else []
