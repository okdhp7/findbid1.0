from __future__ import annotations

import re
from collections.abc import Iterable

from sqlalchemy import bindparam, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import SessionLocal
from findbid_shared.config import get_settings


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
        WITH distinct_top_level_agencies AS (
            SELECT DISTINCT
                   jurisdiction_type,
                   detail_type_large,
                   coalesce(
                       nullif(trim(top_level_agency_name), ''),
                       '최상위기관 미등록'
                   ) AS top_level_agency_name
            FROM demand_agencies
            WHERE NOT deleted
              AND jurisdiction_type <> ''
              AND detail_type_large <> ''
        ), ranked_agencies AS (
            SELECT jurisdiction_type,
                   detail_type_large,
                   top_level_agency_name,
                   count(*) OVER (
                       PARTITION BY jurisdiction_type, detail_type_large
                   ) AS top_level_agency_count,
                   row_number() OVER (
                       PARTITION BY jurisdiction_type, detail_type_large
                       ORDER BY
                           (top_level_agency_name = '최상위기관 미등록'),
                           top_level_agency_name
                   ) AS sample_rank
            FROM distinct_top_level_agencies
        )
        SELECT jurisdiction_type,
               detail_type_large,
               top_level_agency_name,
               top_level_agency_count
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
    for agency_type, detail_name, top_level_agency_name, top_level_agency_count in rows:
        agency_type_text = str(agency_type)
        if agency_type_text not in AGENCY_TYPES:
            continue
        details = grouped.setdefault(agency_type_text, {})
        detail = details.setdefault(
            str(detail_name),
            {
                "name": str(detail_name),
                "topLevelAgencyNames": [],
                "topLevelAgencyCount": int(top_level_agency_count),
            },
        )
        top_level_agency_names = detail["topLevelAgencyNames"]
        if isinstance(top_level_agency_names, list) and len(top_level_agency_names) < 2:
            top_level_agency_names.append(str(top_level_agency_name))

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


def suggest_top_level_agencies(
    session: Session,
    query: str,
    limit: int = 10,
    bid_session: Session | None = None,
) -> list[dict[str, object]]:
    normalized_query = normalize_agency_name(query)
    if not normalized_query:
        return []
    safe_limit = max(1, min(limit, 101))
    normalized_top_level = (
        "lower(regexp_replace(coalesce(top_level_agency_name, ''), "
        "'[[:space:]·ㆍ・]+', '', 'g'))"
    )
    normalized_agency = (
        "lower(regexp_replace(coalesce(name, ''), "
        "'[[:space:]·ㆍ・]+', '', 'g'))"
    )
    statement = text(
        f"""
        WITH matching_top_levels AS (
            SELECT min(top_level_agency_code) AS agency_code,
                   top_level_agency_name AS agency_name,
                   min(top_level_agency_code) AS top_level_agency_code,
                   top_level_agency_name,
                   count(*) AS agency_count,
                   true AS is_top_level
            FROM demand_agencies
            WHERE NOT deleted
              AND top_level_agency_name <> ''
              AND {normalized_top_level} LIKE :contains
            GROUP BY top_level_agency_name
        ), matching_agencies AS (
            SELECT min(code) AS agency_code,
                   name AS agency_name,
                   min(top_level_agency_code) AS top_level_agency_code,
                   min(top_level_agency_name) AS top_level_agency_name,
                   0 AS agency_count,
                   false AS is_top_level
            FROM demand_agencies
            WHERE NOT deleted
              AND name <> ''
              AND {normalized_agency} LIKE :contains
              AND {normalized_agency} <> {normalized_top_level}
            GROUP BY name
        ), suggestions AS (
            SELECT * FROM matching_top_levels
            UNION ALL
            SELECT * FROM matching_agencies
        )
        SELECT agency_code,
               agency_name,
               top_level_agency_code,
               top_level_agency_name,
               agency_count,
               is_top_level
        FROM suggestions
        ORDER BY CASE
                     WHEN lower(regexp_replace(agency_name, '[[:space:]·ㆍ・]+', '', 'g')) = :exact THEN 0
                     WHEN lower(regexp_replace(agency_name, '[[:space:]·ㆍ・]+', '', 'g')) LIKE :prefix THEN 1
                     ELSE 2
                 END,
                 is_top_level DESC,
                 agency_name
        LIMIT :limit
        """
    )
    try:
        rows = session.execute(
            statement,
            {
                "contains": f"%{normalized_query}%",
                "exact": normalized_query,
                "prefix": f"{normalized_query}%",
                "limit": safe_limit,
            },
        ).all()
    except SQLAlchemyError:
        return []
    suggestions = [
        {
            "agencyCode": str(agency_code or ""),
            "agencyName": str(agency_name),
            "topLevelAgencyCode": str(top_level_agency_code or ""),
            "topLevelAgencyName": str(top_level_agency_name or ""),
            "agencyCount": int(agency_count),
            "bidCount": 0,
            "isTopLevel": bool(is_top_level),
        }
        for (
            agency_code,
            agency_name,
            top_level_agency_code,
            top_level_agency_name,
            agency_count,
            is_top_level,
        ) in rows
    ]
    unique_suggestions: dict[str, dict[str, object]] = {}
    for item in suggestions:
        normalized_name = normalize_agency_name(str(item["agencyName"]))
        existing = unique_suggestions.get(normalized_name)
        if existing is None or (
            bool(item["isTopLevel"]) and not bool(existing["isTopLevel"])
        ):
            unique_suggestions[normalized_name] = item
    suggestions = list(unique_suggestions.values())

    if bid_session is not None:
        settings = get_settings()
        schema = settings.bid_database_schema
        table = settings.bid_database_table
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", schema) and re.fullmatch(
            r"[A-Za-z_][A-Za-z0-9_]*",
            table,
        ):
            bid_statement = text(
                f"""
                SELECT agency_name, count(*) AS bid_count
                FROM "{schema}"."{table}"
                WHERE agency_name IS NOT NULL
                  AND coalesce(status, 'open') = 'open'
                  AND (deadline IS NULL OR deadline >= now())
                  AND lower(regexp_replace(agency_name, '[[:space:]·ㆍ・]+', '', 'g'))
                      LIKE :contains
                GROUP BY agency_name
                ORDER BY CASE
                             WHEN lower(regexp_replace(agency_name, '[[:space:]·ㆍ・]+', '', 'g')) = :exact THEN 0
                             WHEN lower(regexp_replace(agency_name, '[[:space:]·ㆍ・]+', '', 'g')) LIKE :prefix THEN 1
                             ELSE 2
                         END,
                         bid_count DESC,
                         agency_name
                LIMIT :candidate_limit
                """
            )
            try:
                bid_rows = bid_session.execute(
                    bid_statement,
                    {
                        "contains": f"%{normalized_query}%",
                        "exact": normalized_query,
                        "prefix": f"{normalized_query}%",
                        "candidate_limit": max(20, safe_limit * 3),
                    },
                ).all()
            except SQLAlchemyError:
                bid_rows = []

            by_name = {
                normalize_agency_name(str(item["agencyName"])): item
                for item in suggestions
            }
            for agency_name, bid_count in bid_rows:
                agency_name_text = str(agency_name or "").strip()
                normalized_name = normalize_agency_name(agency_name_text)
                if not normalized_name:
                    continue
                existing = by_name.get(normalized_name)
                if existing is not None:
                    existing["bidCount"] = int(bid_count)
                    continue
                item: dict[str, object] = {
                    "agencyCode": "",
                    "agencyName": agency_name_text,
                    "topLevelAgencyCode": "",
                    "topLevelAgencyName": "",
                    "agencyCount": 0,
                    "bidCount": int(bid_count),
                    "isTopLevel": False,
                }
                suggestions.append(item)
                by_name[normalized_name] = item

    def suggestion_rank(item: dict[str, object]) -> tuple[int, int, int, str]:
        normalized_name = normalize_agency_name(str(item["agencyName"]))
        match_rank = (
            0
            if normalized_name == normalized_query
            else 1
            if normalized_name.startswith(normalized_query)
            else 2
        )
        return (
            match_rank,
            0 if bool(item["isTopLevel"]) and match_rank == 0 else 1,
            -int(item["bidCount"]),
            str(item["agencyName"]),
        )

    return sorted(suggestions, key=suggestion_rank)[:safe_limit]


def resolve_demand_agency_filters(
    values: Iterable[str],
) -> tuple[list[str], list[str]]:
    normalized_inputs = list(
        dict.fromkeys(
            normalize_agency_name(value)
            for value in values
            if normalize_agency_name(value)
        )
    )
    if not normalized_inputs:
        return [], []

    normalized_top_level = (
        "lower(regexp_replace(coalesce(top_level_agency_name, ''), "
        "'[[:space:]·ㆍ・]+', '', 'g'))"
    )
    statement = text(
        f"""
        SELECT DISTINCT normalized_name, {normalized_top_level} AS normalized_top_level
        FROM demand_agencies
        WHERE NOT deleted
          AND {normalized_top_level} IN :normalized_inputs
          AND normalized_name <> ''
        """
    ).bindparams(bindparam("normalized_inputs", expanding=True))
    try:
        with SessionLocal() as session:
            rows = session.execute(
                statement,
                {"normalized_inputs": normalized_inputs},
            ).all()
    except SQLAlchemyError:
        return [], normalized_inputs

    matched_top_levels = {str(row[1]) for row in rows}
    child_agency_names = list(
        dict.fromkeys(
            [
                *(
                    value
                    for value in normalized_inputs
                    if value in matched_top_levels
                ),
                *(str(row[0]) for row in rows if str(row[0]).strip()),
            ]
        )
    )
    direct_inputs = [
        value for value in normalized_inputs if value not in matched_top_levels
    ]
    return child_agency_names, direct_inputs


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
