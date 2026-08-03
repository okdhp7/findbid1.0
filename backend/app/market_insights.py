from __future__ import annotations

import calendar
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo


KOREA_TIMEZONE = ZoneInfo("Asia/Seoul")
KEYWORD_PATTERN = re.compile(r"[a-z][a-z0-9+#.-]{1,}|[가-힣]{2,}")
KOREAN_COMPOUND_PATTERN = re.compile(r"[가-힣0-9]{4,}")
MIN_KEYWORD_MODEL_QUALITY = 0.12
IGNORED_KEYWORDS = {
    "공고", "입찰", "입찰공고", "사업", "용역", "물품", "공사", "계약",
    "업체", "제출", "안내", "관련", "과업", "전자입찰", "견적", "견적제출",
    "소액수의", "제안서", "나라장터", "조달청", "선정", "연간", "단가",
    "학년도", "학년", "학기", "연도", "년도", "금년도", "차년도", "상반기", "하반기",
    "분기", "회차", "차수", "구매", "구입", "도입", "운영", "단계", "추진",
    "시행", "진행", "계획", "지원", "관리", "제작", "설치", "구축", "개선",
    "보수", "정비", "교체", "업무", "수행", "실시", "제공", "발주", "모집",
    "요청", "공급", "납품", "대행", "위탁", "긴급", "재공고", "변경", "취소",
    "신규", "대상", "일체", "위한", "대한", "따른", "통한", "관한", "해당",
    "포함", "예정", "전국", "지역", "자격", "면허", "인증", "사업자", "예산",
    "금액", "시스템", "운영관리", "관리운영", "운영지원", "구매설치", "구매납품",
    "도입운영", "구축운영", "권역", "연구", "개발", "조성", "처리",
    "수의", "개소", "지구",
}
GENERIC_KEYWORD_SUFFIXES = ("공고", "사업", "용역", "공사", "계약")
KEYWORD_ALIASES = {
    "ai": "인공지능",
    "a.i": "인공지능",
    "인공지능": "인공지능",
    "홈페이지": "홈페이지",
    "웹사이트": "홈페이지",
    "유지보수": "유지관리",
    "유지관리": "유지관리",
}
REGION_PREFIXES = {
    "서울": ("서울특별시", "서울"),
    "부산": ("부산광역시", "부산"),
    "대구": ("대구광역시", "대구"),
    "인천": ("인천광역시", "인천"),
    "광주": ("광주광역시", "광주"),
    "대전": ("대전광역시", "대전"),
    "울산": ("울산광역시", "울산"),
    "세종": ("세종특별자치시", "세종"),
    "경기": ("경기도", "경기"),
    "강원": ("강원특별자치도", "강원도", "강원"),
    "충북": ("충청북도", "충북"),
    "충남": ("충청남도", "충남"),
    "전북": ("전북특별자치도", "전라북도", "전북"),
    "전남": ("전라남도", "전남"),
    "경북": ("경상북도", "경북"),
    "경남": ("경상남도", "경남"),
    "제주": ("제주특별자치도", "제주도", "제주"),
}
BUDGET_BANDS = (
    ("under-1", "1억원 미만", 1, 100_000_000),
    ("1-5", "1억원 이상~5억원 미만", 100_000_000, 500_000_000),
    ("5-10", "5억원 이상~10억원 미만", 500_000_000, 1_000_000_000),
    ("10-50", "10억원 이상~50억원 미만", 1_000_000_000, 5_000_000_000),
    ("over-50", "50억원 이상", 5_000_000_000, float("inf")),
    ("unknown", "금액 미정", 0, 1),
)


def months_ago(value: datetime, months: int) -> datetime:
    month_index = value.year * 12 + value.month - 1 - months
    year, month_zero = divmod(month_index, 12)
    month = month_zero + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def _category(row: dict[str, Any]) -> str:
    category = str(row.get("category") or "")
    if category in {"용역", "물품", "공사"}:
        return category
    return {
        "service": "용역",
        "goods": "물품",
        "construction": "공사",
    }.get(str(row.get("bid_type") or ""), "용역")


def _region(value: Any) -> str:
    region = str(value or "").strip()
    if not region:
        return "전국"
    for label, prefixes in REGION_PREFIXES.items():
        if region.startswith(prefixes):
            return label
    return region


def _budget(row: dict[str, Any]) -> int:
    for name in ("estimated_price", "budget_amount", "base_price"):
        value = row.get(name)
        if value:
            return max(0, int(value))
    return 0


def _budget_band(value: int) -> str:
    if value <= 0:
        return "unknown"
    for key, _, minimum, maximum in BUDGET_BANDS:
        if minimum <= value < maximum:
            return key
    return "unknown"


def _normalize_keyword(token: str) -> str:
    normalized = token.strip(".-")
    for suffix in GENERIC_KEYWORD_SUFFIXES:
        if normalized.endswith(suffix) and len(normalized) > len(suffix):
            normalized = normalized[: -len(suffix)]
            break
    normalized = KEYWORD_ALIASES.get(normalized, normalized)
    return normalized if len(normalized) >= 2 and normalized not in IGNORED_KEYWORDS else ""


def _keywords(title: str) -> set[str]:
    return {
        normalized
        for token in KEYWORD_PATTERN.findall(title.lower())
        if (normalized := _normalize_keyword(token))
    }


def _context_values(row: dict[str, Any]) -> set[str]:
    values = {
        re.sub(r"[^a-z0-9가-힣]+", "", str(value).lower())
        for value in (
            row.get("sub_category"),
            row.get("detail_category"),
            row.get("item_group_name"),
            *(row.get("required_licenses") or []),
        )
        if value
    }
    return {value for value in values if len(value) >= 2}


def _extract_core_keywords(
    title: str,
    context_values: set[str],
    limit: int = 3,
) -> list[tuple[str, float, set[str]]]:
    """제목 위치·분류 일치·구체성을 이용하는 경량 비지도 핵심어 모델."""
    raw_tokens = KEYWORD_PATTERN.findall(title.lower())
    if not raw_tokens:
        return []

    normalized_tokens = [_normalize_keyword(token) for token in raw_tokens]
    candidates: dict[str, tuple[float, set[str]]] = {}
    denominator = max(1, len(raw_tokens) - 1)
    for index, keyword in enumerate(normalized_tokens):
        if not keyword:
            continue
        position_score = 1.0 - (index / denominator) if denominator else 1.0
        context_match = any(
            keyword in value or (len(value) <= len(keyword) and value in keyword)
            for value in context_values
        )
        specificity_score = min(1.0, len(keyword) / 6)
        salience = (
            position_score * 0.55
            + (0.30 if context_match else 0.0)
            + specificity_score * 0.15
        )
        neighbors = {
            normalized_tokens[neighbor]
            for neighbor in (index - 1, index + 1)
            if 0 <= neighbor < len(normalized_tokens)
            and normalized_tokens[neighbor]
        }
        previous = candidates.get(keyword)
        if previous is None or salience > previous[0]:
            candidates[keyword] = (salience, neighbors)
        else:
            previous[1].update(neighbors)

    ranked = sorted(
        candidates.items(),
        key=lambda item: (-item[1][0], -len(item[0]), item[0]),
    )[:limit]
    return [
        (keyword, round(score, 6), neighbors)
        for keyword, (score, neighbors) in ranked
    ]


def _diversity_ratio(unique_count: int, occurrence_count: int) -> float:
    if unique_count <= 0 or occurrence_count <= 1:
        return 0.0
    return min(
        1.0,
        math.log1p(unique_count) / math.log1p(occurrence_count),
    )


def _compound_suffixes(title: str) -> set[tuple[str, str]]:
    suffixes: set[tuple[str, str]] = set()
    for compound in KOREAN_COMPOUND_PATTERN.findall(title.lower()):
        for index in range(1, len(compound) - 1):
            suffix = compound[index:].lstrip("0123456789")
            if (
                2 <= len(suffix) <= 6
                and suffix != compound
                and suffix.isalpha()
            ):
                suffixes.add((suffix, compound))
    return suffixes


def _keyword_model_quality(
    label: str,
    stats: dict[str, Any],
    compound_variant_count: int,
) -> float:
    occurrences = max(1, int(stats["occurrences"]))
    average_salience = float(stats["salience"]) / occurrences
    context_diversity = _diversity_ratio(len(stats["contexts"]), occurrences)
    market_diversity = _diversity_ratio(
        len(stats["market_contexts"]),
        occurrences,
    )
    dominant_context_ratio = (
        max(stats["contexts"].values(), default=0) / occurrences
    )
    cohesion = max(
        0.35,
        1.25 - context_diversity * 0.55 - market_diversity * 0.35,
    )
    redundancy_penalty = max(0.35, 1.0 - dominant_context_ratio * 0.70)
    compound_penalty = 1.0 / (
        1.0 + math.log1p(compound_variant_count) * 0.24
    )
    lexical_specificity = (
        0.65
        if len(label) == 2 and re.fullmatch(r"[가-힣]{2}", label)
        else 1.0
    )
    return (
        average_salience
        * cohesion
        * redundancy_penalty
        * compound_penalty
        * lexical_specificity
    )


def _ranked(counter: Counter[str], limit: int) -> list[dict[str, Any]]:
    return [
        {"label": label, "count": count}
        for label, count in sorted(
            counter.items(),
            key=lambda item: (-item[1], item[0]),
        )[:limit]
    ]


def build_market_insights(
    rows: list[dict[str, Any]],
    period_start: datetime,
    period_end: datetime,
) -> dict[str, Any]:
    category_counts: Counter[str] = Counter()
    region_counts: Counter[str] = Counter()
    contract_counts: Counter[str] = Counter()
    demand_counts: Counter[str] = Counter()
    group_counts: Counter[tuple[str, str]] = Counter()
    keyword_counts: dict[
        tuple[str, str],
        dict[str, dict[str, float | int]],
    ] = defaultdict(dict)
    keyword_model_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "occurrences": 0,
            "salience": 0.0,
            "contexts": Counter(),
            "market_contexts": set(),
        }
    )
    compound_variants: dict[str, set[str]] = defaultdict(set)
    budget_total = 0
    budget_count = 0
    period_seconds = max(1.0, (period_end - period_start).total_seconds())
    recent_start = period_end - timedelta(days=30)
    previous_start = period_end - timedelta(days=60)

    for row in rows:
        category = _category(row)
        region = _region(row.get("region_name"))
        contract = str(row.get("contract_method") or "미분류").strip() or "미분류"
        budget = _budget(row)
        budget_band = _budget_band(budget)
        announce_date = row.get("announce_date")
        if not isinstance(announce_date, datetime):
            continue
        if announce_date.tzinfo is None:
            announce_date = announce_date.replace(tzinfo=KOREA_TIMEZONE)
        announce_date = announce_date.astimezone(KOREA_TIMEZONE)

        category_counts[category] += 1
        region_counts[region] += 1
        contract_counts[contract] += 1
        if budget > 0:
            budget_total += budget
            budget_count += 1

        demand_values = {
            str(value).strip()
            for value in (
                row.get("sub_category"),
                row.get("detail_category"),
                row.get("item_group_name"),
                *(row.get("required_licenses") or []),
            )
            if value
            and str(value).strip() not in {"용역", "물품", "공사", "기타"}
            and not any(
                ignored in str(value).replace(" ", "").strip()
                for ignored in (
                    "규격서",
                    "시방서",
                    "사양서",
                    "수요기관규격",
                    "참조",
                    "참고",
                )
            )
        }
        demand_counts.update(demand_values)

        age_ratio = min(
            1.0,
            max(0.0, (period_end - announce_date).total_seconds() / period_seconds),
        )
        recency_weight = 1.0 + (1.0 - age_ratio) * 0.45
        groups = (
            ("all", "all"),
            ("category", category),
            ("region", region),
            ("budget", budget_band),
        )
        title = str(row.get("title") or "")
        for suffix, compound in _compound_suffixes(title):
            compound_variants[suffix].add(compound)
        context_values = _context_values(row)
        title_keywords = _extract_core_keywords(
            title,
            context_values,
        )
        for keyword, salience, neighbors in title_keywords:
            model_stats = keyword_model_stats[keyword]
            model_stats["occurrences"] += 1
            model_stats["salience"] += salience
            model_stats["contexts"].update(neighbors)
            model_stats["market_contexts"].update(context_values)
        for group in groups:
            group_counts[group] += 1
            group_keyword_counts = keyword_counts[group]
            for keyword, salience, _ in title_keywords:
                stats = group_keyword_counts.setdefault(
                    keyword,
                    {"count": 0, "recent": 0, "previous": 0, "heat": 0.0},
                )
                stats["count"] += 1
                stats["heat"] += recency_weight * salience
                if announce_date >= recent_start:
                    stats["recent"] += 1
                elif announce_date >= previous_start:
                    stats["previous"] += 1

    keyword_groups: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(dict)
    keyword_group_counts: dict[str, dict[str, int]] = defaultdict(dict)
    for (dimension, group), values in keyword_counts.items():
        total = group_counts[(dimension, group)]
        minimum_count = 3 if total >= 100 else 2 if total >= 30 else 1
        results: list[dict[str, Any]] = []
        for label, stats in values.items():
            count = int(stats["count"])
            if count < minimum_count:
                continue
            recent = int(stats["recent"])
            previous = int(stats["previous"])
            model_quality = _keyword_model_quality(
                label,
                keyword_model_stats[label],
                len(compound_variants.get(label, set())),
            )
            if model_quality < MIN_KEYWORD_MODEL_QUALITY:
                continue
            results.append(
                {
                    "label": label,
                    "count": count,
                    "share": round(count / total * 100, 1) if total else 0,
                    "heat": round(float(stats["heat"]) * model_quality, 3),
                    "relevance": round(min(100.0, model_quality * 100), 1),
                    "change": (
                        round((recent - previous) / previous * 100)
                        if previous > 0
                        else None
                    ),
                    "isNew": previous == 0 and recent > 0,
                }
            )
        keyword_groups[dimension][group] = sorted(
            results,
            key=lambda item: (-item["heat"], -item["count"], item["label"]),
        )[:10]
        keyword_group_counts[dimension][group] = total

    budget_labels = {key: label for key, label, _, _ in BUDGET_BANDS}
    return {
        "periodStart": period_start.date().isoformat(),
        "periodEnd": period_end.date().isoformat(),
        "total": len(rows),
        "averageBudget": round(budget_total / budget_count) if budget_count else 0,
        "categoryBreakdown": _ranked(category_counts, 3),
        "regionBreakdown": _ranked(region_counts, 17),
        "contractBreakdown": _ranked(contract_counts, 5),
        "demands": _ranked(demand_counts, 8),
        "keywordGroups": dict(keyword_groups),
        "keywordGroupCounts": dict(keyword_group_counts),
        "budgetLabels": budget_labels,
        "keywordModel": {
            "name": "경량 비지도 핵심어 모델",
            "features": ["제목 위치", "분류 일치", "문맥 응집도"],
            "embeddingUsed": False,
        },
    }
