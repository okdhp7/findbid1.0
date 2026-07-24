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
    result = search.json()
    assert result["total"] >= 1
    assert result["eligibleTotal"] >= 0
    assert result["closingSoonTotal"] >= 0
    assert 0 <= result["averageScore"] <= 100
    assert 0 <= result["items"][0]["score"] <= 100
    assert 0 <= result["items"][0]["scoreConfidence"] <= 100
    assert result["items"][0]["scoreBreakdown"]
    assert result["items"][0]["scoreReasons"]
