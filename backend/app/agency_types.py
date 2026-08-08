from __future__ import annotations

import re
from collections.abc import Iterable

from sqlalchemy import bindparam, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import SessionLocal


AGENCY_TYPES = (
    "공기업",
    "교육기관",
    "국가기관",
    "기타공공기관",
    "기타기관",
    "정부투자기관",
    "준정부기관",
    "지방공기업",
    "지방자치단체",
    "지자체 출자출연기관",
)


def list_agency_type_details(session: Session) -> list[dict[str, object]]:
    statement = text(
        """
        WITH distinct_agencies AS (
            SELECT DISTINCT jurisdiction_type, detail_type_large, name
            FROM demand_agencies
            WHERE NOT deleted
              AND jurisdiction_type <> ''
              AND detail_type_large <> ''
              AND name <> ''
        ), ranked_agencies AS (
            SELECT jurisdiction_type,
                   detail_type_large,
                   name,
                   count(*) OVER (
                       PARTITION BY jurisdiction_type, detail_type_large
                   ) AS agency_count,
                   row_number() OVER (
                       PARTITION BY jurisdiction_type, detail_type_large
                       ORDER BY name
                   ) AS sample_rank
            FROM distinct_agencies
        )
        SELECT jurisdiction_type, detail_type_large, name, agency_count
        FROM ranked_agencies
        WHERE sample_rank <= 2
        ORDER BY jurisdiction_type, detail_type_large, sample_rank
        """
    )
    try:
        rows = session.execute(statement).all()
    except SQLAlchemyError:
        return []

    grouped: dict[str, dict[str, dict[str, object]]] = {}
    for agency_type, detail_name, agency_name, agency_count in rows:
        agency_type_text = str(agency_type)
        if agency_type_text not in AGENCY_TYPES:
            continue
        details = grouped.setdefault(agency_type_text, {})
        detail = details.setdefault(
            str(detail_name),
            {
                "name": str(detail_name),
                "agencyNames": [],
                "agencyCount": int(agency_count),
            },
        )
        agency_names = detail["agencyNames"]
        if isinstance(agency_names, list) and len(agency_names) < 2:
            agency_names.append(str(agency_name))

    return [
        {
            "name": agency_type,
            "details": list(grouped.get(agency_type, {}).values()),
        }
        for agency_type in AGENCY_TYPES
        if grouped.get(agency_type)
    ]


def normalize_agency_name(value: str) -> str:
    return re.sub(r"[\s·ㆍ・]+", "", str(value or "").strip()).lower()


def _fallback_agency_type(name: str) -> str:
    normalized = normalize_agency_name(name)
    if not normalized:
        return ""
    if any(
        marker in normalized
        for marker in ("교육청", "대학교", "대학", "고등학교", "중학교", "초등학교", "유치원")
    ):
        return "교육기관"
    if any(
        marker in normalized
        for marker in ("도시공사", "시설공단", "교통공사", "개발공사", "환경공단")
    ):
        return "지방공기업"
    if any(
        marker in normalized
        for marker in ("특별시", "광역시", "특별자치시", "특별자치도", "도청", "시청", "군청", "구청")
    ):
        return "지방자치단체"
    if normalized.endswith(("부", "처", "청", "위원회")):
        return "국가기관"
    if normalized.startswith("한국") and normalized.endswith(("공사", "공단")):
        return "공기업"
    return ""


def resolve_agency_types(names: Iterable[str]) -> dict[str, str]:
    normalized_names = {
        normalize_agency_name(name)
        for name in names
        if normalize_agency_name(name)
    }
    if not normalized_names:
        return {}

    resolved: dict[str, str] = {}
    statement = text(
        """
        SELECT DISTINCT ON (normalized_name)
               normalized_name, jurisdiction_type
        FROM demand_agencies
        WHERE NOT deleted
          AND normalized_name IN :normalized_names
          AND jurisdiction_type <> ''
        ORDER BY normalized_name, synced_at DESC
        """
    ).bindparams(bindparam("normalized_names", expanding=True))
    try:
        with SessionLocal() as session:
            rows = session.execute(
                statement,
                {"normalized_names": sorted(normalized_names)},
            ).all()
        resolved.update(
            (str(normalized_name), str(agency_type))
            for normalized_name, agency_type in rows
            if str(agency_type) in AGENCY_TYPES
        )
    except SQLAlchemyError:
        pass

    for normalized_name in normalized_names:
        if normalized_name not in resolved:
            resolved[normalized_name] = _fallback_agency_type(normalized_name)
    return resolved
