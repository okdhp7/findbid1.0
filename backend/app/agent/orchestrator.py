from app.knowledge import analyze_query
from findbid_shared.schemas import SearchRequest


REGIONS = [
    "서울",
    "부산",
    "대구",
    "인천",
    "광주",
    "대전",
    "울산",
    "세종",
    "경기",
    "강원",
    "충북",
    "충남",
    "전북",
    "전남",
    "경북",
    "경남",
    "제주",
]
TECH_KEYWORDS = ["AI", "인공지능", "LLM", "RAG", "Java", "React", "Python", "데이터", "GIS", "클라우드"]


def build_search_request(text: str) -> SearchRequest:
    analysis = analyze_query(text)
    region = (
        analysis.preferred_regions[0]
        if len(analysis.preferred_regions) == 1
        else None
    )
    category = analysis.category
    max_budget = analysis.max_budget
    include = [keyword for keyword in TECH_KEYWORDS if keyword.lower() in text.lower()]
    exclude: list[str] = []
    for phrase in ["장비 납품", "상주 인력파견", "단순 유지보수"]:
        if phrase in text and "제외" in text:
            exclude.append(phrase)
    return SearchRequest(
        category=category,
        region=region,
        min_budget=analysis.min_budget,
        max_budget=max_budget,
        include_keywords=include,
        exclude_keywords=exclude,
        semantic_query=text,
    )


def describe_search_intent(text: str) -> list[str]:
    if not text.strip():
        return []
    return list(analyze_query(text).conditions)
