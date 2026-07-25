from __future__ import annotations

from functools import lru_cache


REGION_GRAPH: dict[str, dict[str, tuple[str, ...]]] = {
    "수도권": {"members": ("서울", "경기", "인천"), "aliases": ("수도권", "서울권")},
    "충청권": {"members": ("대전", "세종", "충북", "충남"), "aliases": ("충청권", "충청 지역")},
    "호남권": {"members": ("광주", "전북", "전남"), "aliases": ("호남권", "호남 지역")},
    "영남권": {"members": ("부산", "대구", "울산", "경북", "경남"), "aliases": ("영남권", "영남 지역")},
    "강원권": {"members": ("강원",), "aliases": ("강원권", "강원 지역")},
    "제주권": {"members": ("제주",), "aliases": ("제주권", "제주 지역")},
}

REGIONS: dict[str, tuple[str, ...]] = {
    "서울": ("서울", "서울시", "서울특별시"),
    "부산": ("부산", "부산시", "부산광역시"),
    "대구": ("대구", "대구시", "대구광역시"),
    "인천": ("인천", "인천시", "인천광역시"),
    "광주": ("광주", "광주시", "광주광역시"),
    "대전": ("대전", "대전시", "대전광역시"),
    "울산": ("울산", "울산시", "울산광역시"),
    "세종": ("세종", "세종시", "세종특별자치시"),
    "경기": ("경기", "경기도"),
    "강원": ("강원", "강원도", "강원특별자치도"),
    "충북": ("충북", "충청북도"),
    "충남": ("충남", "충청남도"),
    "전북": ("전북", "전라북도", "전북특별자치도"),
    "전남": ("전남", "전라남도"),
    "경북": ("경북", "경상북도"),
    "경남": ("경남", "경상남도"),
    "제주": ("제주", "제주도", "제주특별자치도"),
}


@lru_cache(maxsize=128)
def expand_region(value: str) -> tuple[str, ...]:
    normalized = value.strip().lower()
    for group, data in REGION_GRAPH.items():
        if normalized == group.lower() or any(
            normalized == alias.lower() for alias in data["aliases"]
        ):
            return data["members"]
    for region, aliases in REGIONS.items():
        if normalized == region.lower() or any(
            normalized == alias.lower() for alias in aliases
        ):
            return (region,)
    return ()


@lru_cache(maxsize=128)
def region_aliases(value: str) -> tuple[str, ...]:
    expanded = expand_region(value)
    aliases: list[str] = []
    for region in expanded:
        aliases.extend(REGIONS.get(region, (region,)))
    return tuple(dict.fromkeys(alias.lower() for alias in aliases))


def find_regions(text: str) -> tuple[tuple[str, tuple[str, ...]], ...]:
    normalized = text.lower()
    matches: list[tuple[str, tuple[str, ...]]] = []
    for group, data in REGION_GRAPH.items():
        if any(alias.lower() in normalized for alias in data["aliases"]):
            matches.append((group, data["members"]))
    matched_members = {member for _, members in matches for member in members}
    for region, aliases in REGIONS.items():
        if region in matched_members:
            continue
        if any(alias.lower() in normalized for alias in aliases):
            matches.append((region, (region,)))
    return tuple(matches)
