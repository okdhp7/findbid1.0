from findbid_shared.schemas import BidRecord


COMPANY_PROFILE = {
    "name": "아이비즈토피아",
    "location": "경기도 성남시",
    "size": "중소기업",
    "licenses": ["소프트웨어사업자", "정보통신공사업"],
    "technologies": ["생성형 AI", "Java", "React", "Python", "데이터 플랫폼"],
    "experiences": [],
    "preferred_max_budget": None,
    "completion": 86,
}


def evaluate_eligibility(bid: BidRecord) -> dict:
    profile_text = " ".join(
        [COMPANY_PROFILE["location"], *COMPANY_PROFILE["licenses"], *COMPANY_PROFILE["technologies"]]
    )
    matched = [item for item in bid.requirements if any(token in profile_text for token in item.split())]
    unresolved = [item for item in bid.requirements if item not in matched]
    return {
        "status": bid.eligibility,
        "matchedRequirements": matched,
        "unresolvedRequirements": unresolved,
        "risks": bid.risks,
    }
