import re

from findbid_shared.schemas import SearchRequest


REGIONS = ["서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종", "제주"]
TECH_KEYWORDS = ["AI", "인공지능", "LLM", "RAG", "Java", "React", "Python", "데이터", "GIS", "클라우드"]


def build_search_request(text: str) -> SearchRequest:
    region = next((name for name in REGIONS if name in text), None)
    category = next((name for name in ["용역", "물품", "공사"] if name in text), None)
    amount_match = re.search(r"(\d+(?:\.\d+)?)\s*억", text)
    max_budget = int(float(amount_match.group(1)) * 100_000_000) if amount_match else None
    include = [keyword for keyword in TECH_KEYWORDS if keyword.lower() in text.lower()]
    exclude: list[str] = []
    for phrase in ["장비 납품", "상주 인력파견", "단순 유지보수"]:
        if phrase in text and "제외" in text:
            exclude.append(phrase)
    return SearchRequest(
        category=category,
        region=region,
        max_budget=max_budget,
        include_keywords=include,
        exclude_keywords=exclude,
        semantic_query=text,
    )
