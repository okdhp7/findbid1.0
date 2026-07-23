import os

import httpx


def test_health_and_search() -> None:
    base_url = os.getenv("TEST_BACKEND_URL", "http://localhost:8000")
    health = httpx.get(f"{base_url}/api/v1/health", timeout=5)
    assert health.status_code == 200
    assert health.json()["status"] == "정상"

    search = httpx.post(
        f"{base_url}/api/v1/search",
        json={
            "category": "용역",
            "maxBudget": 500000000,
            "includeKeywords": ["AI"],
        },
        timeout=5,
    )
    assert search.status_code == 200
    assert search.json()["total"] >= 1
