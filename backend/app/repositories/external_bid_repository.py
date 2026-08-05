from __future__ import annotations

import hashlib
import logging
import math
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.eligibility.rules import COMPANY_PROFILE
from app.knowledge import analyze_query
from app.knowledge.regions import region_aliases
from app.repositories.semantic_embedding_repository import (
    SemanticEmbeddingRepository,
)
from app.scoring import calculate_hybrid_score
from app.search_intent import (
    SemanticIntent,
    matches_semantic_constraints,
    parse_semantic_intent,
    semantic_lexical_rank,
)
from app.search_conditions import build_search_conditions, condition_matches
from app.semantic import get_semantic_search_engine
from findbid_shared.config import get_settings
from findbid_shared.schemas import BidRecord, SearchRequest


KOREA_TIMEZONE = ZoneInfo("Asia/Seoul")
logger = logging.getLogger(__name__)
SAFE_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
NATIONWIDE_REGION_SQL = "coalesce(btrim(b.region_restriction), '') = ''"
REGION_PREFIXES = {
    "서울": ("서울특별시",),
    "부산": ("부산광역시",),
    "대구": ("대구광역시",),
    "인천": ("인천광역시",),
    "광주": ("광주광역시",),
    "대전": ("대전광역시",),
    "울산": ("울산광역시",),
    "세종": ("세종특별자치시",),
    "경기": ("경기도",),
    "강원": ("강원특별자치도", "강원도"),
    "충북": ("충청북도",),
    "충남": ("충청남도",),
    "전북": ("전북특별자치도", "전라북도"),
    "전남": ("전라남도",),
    "경북": ("경상북도",),
    "경남": ("경상남도",),
    "제주": ("제주특별자치도", "제주도"),
}
ATTACHMENT_FILE_TYPES = {
    "pdf": "PDF",
    "hwp": "한글",
    "hwpx": "한글",
    "xls": "엑셀",
    "xlsx": "엑셀",
    "csv": "엑셀",
    "doc": "워드",
    "docx": "워드",
    "ppt": "파워포인트",
    "pptx": "파워포인트",
    "zip": "압축파일",
    "rar": "압축파일",
    "7z": "압축파일",
    "jpg": "이미지",
    "jpeg": "이미지",
    "png": "이미지",
    "gif": "이미지",
    "txt": "텍스트",
}


class ExternalBidRepository:
    """TPlan의 입찰공고 테이블을 쓰기 없이 조회하는 저장소."""

    def __init__(self, session: Session):
        self.session = session
        self.last_search_trace: list[str] = []
        settings = get_settings()
        if not SAFE_IDENTIFIER.fullmatch(settings.bid_database_schema):
            raise ValueError("입찰공고 DB 스키마 이름이 올바르지 않습니다.")
        if not SAFE_IDENTIFIER.fullmatch(settings.bid_database_table):
            raise ValueError("입찰공고 DB 테이블 이름이 올바르지 않습니다.")
        self.table_name = (
            f'"{settings.bid_database_schema}"."{settings.bid_database_table}"'
        )

    @staticmethod
    def _budget_label(amount: int) -> str:
        if amount <= 0:
            return "금액 미정"
        billion, remainder = divmod(amount, 100_000_000)
        ten_thousand = remainder // 10_000
        if billion and ten_thousand:
            return f"{billion:,}억 {ten_thousand:,}만원"
        if billion:
            return f"{billion:,}억원"
        if ten_thousand:
            return f"{ten_thousand:,}만원"
        return f"{amount:,}원"

    @staticmethod
    def _category(row: dict[str, Any]) -> str:
        if row.get("category") in {"용역", "물품", "공사"}:
            return row["category"]
        return {
            "service": "용역",
            "goods": "물품",
            "construction": "공사",
        }.get(row.get("bid_type"), "용역")

    @staticmethod
    def _eligibility(row: dict[str, Any]) -> str:
        has_licenses = bool(row.get("required_licenses"))
        has_region_limit = bool((row.get("region_restriction") or "").strip())
        is_sme_only = bool(row.get("sme_only"))
        if not has_licenses and not has_region_limit and not is_sme_only:
            return "참가 가능"
        return "자격 확인 필요"

    @staticmethod
    def _short_region(region_name: str | None) -> str:
        region_name = str(region_name or "").strip()
        if not region_name:
            return ""
        for short_name, prefixes in REGION_PREFIXES.items():
            if region_name.startswith(prefixes):
                return short_name
        return region_name

    @classmethod
    def _participant_region(cls, row: dict[str, Any]) -> str:
        restriction = str(row.get("region_restriction") or "").strip()
        if not restriction:
            return "전국"

        region = cls._short_region(row.get("region_name"))
        return region or "지역 확인 필요"

    @staticmethod
    def _days_left(deadline: datetime | None) -> int:
        if deadline is None:
            return 0
        now = datetime.now(timezone.utc)
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        return max(0, math.ceil((deadline - now).total_seconds() / 86_400))

    @staticmethod
    def _close_at(deadline: datetime | None) -> str:
        if deadline is None:
            return "마감일 미정"
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        return deadline.astimezone(KOREA_TIMEZONE).strftime("%Y.%m.%d %H:%M")

    @staticmethod
    def _attachments(value: Any) -> list[dict[str, str]]:
        if not isinstance(value, list):
            return []

        attachments: list[dict[str, str]] = []
        seen_urls: set[str] = set()
        for index, item in enumerate(value[:100], start=1):
            if not isinstance(item, dict):
                continue
            url = str(item.get("url") or "").strip()
            if not url or url in seen_urls:
                continue
            parsed_url = urlparse(url)
            if parsed_url.scheme not in {"http", "https"}:
                continue

            name = str(item.get("name") or "").strip() or f"첨부문서 {index}"
            extension_match = re.search(r"\.([A-Za-z0-9]{1,10})$", name)
            extension = (
                extension_match.group(1).lower()
                if extension_match
                else ""
            )
            is_link = str(item.get("size") or "").strip() == "링크"
            file_type = (
                "바로가기"
                if is_link
                else ATTACHMENT_FILE_TYPES.get(extension, "기타")
            )
            attachments.append(
                {
                    "name": name[:500],
                    "url": url,
                    "size": str(item.get("size") or "").strip()[:80],
                    "extension": extension,
                    "file_type": file_type,
                }
            )
            seen_urls.add(url)
        return attachments

    @staticmethod
    def _keyword_list(request: SearchRequest) -> list[str]:
        words = list(
            dict.fromkeys(
                word.strip()
                for word in request.include_keywords
                if word.strip()
            )
        )
        if not get_settings().semantic_search_enabled:
            words.extend(
                word
                for word in re.split(
                    r"[\s,，.]+",
                    request.semantic_query.strip(),
                )
                if len(word) >= 2
            )
        return list(dict.fromkeys(words))

    @staticmethod
    def _matched_search_conditions(
        row: dict[str, Any],
        request: SearchRequest,
    ) -> list[str]:
        analysis = analyze_query(request.semantic_query)
        demand_agency = str(
            row.get("agency_name") or row.get("noticer_name") or ""
        ).lower()
        contract_method = str(row.get("contract_method") or "").lower()
        matched_conditions = [
            f"수요기관: {agency}"
            for agency in analysis.demand_agencies
            if agency.lower() in demand_agency
        ]
        matched_conditions.extend(
            f"계약방법: {method}"
            for method in analysis.contract_methods
            if method.lower() in contract_method
        )
        min_budget = (
            analysis.min_budget
            if analysis.min_budget is not None
            else request.min_budget
            if request.min_budget is not None and request.min_budget > 0
            else None
        )
        max_budget = (
            analysis.max_budget
            if analysis.max_budget is not None
            else request.max_budget
            if request.max_budget is not None and request.max_budget > 0
            else None
        )
        min_operator = (
            "이상"
            if (
                analysis.min_budget_inclusive
                if analysis.min_budget is not None
                else True
            )
            else "초과"
        )
        max_operator = (
            "이하"
            if (
                analysis.max_budget_inclusive
                if analysis.max_budget is not None
                else True
            )
            else "미만"
        )
        if min_budget is not None and max_budget is not None:
            matched_conditions.append(
                "사업금액: "
                f"{ExternalBidRepository._budget_label(min_budget)} "
                f"{min_operator} "
                f"{ExternalBidRepository._budget_label(max_budget)} "
                f"{max_operator}"
            )
        elif min_budget is not None:
            matched_conditions.append(
                "사업금액: "
                f"{ExternalBidRepository._budget_label(min_budget)} "
                f"{min_operator}"
            )
        elif max_budget is not None:
            matched_conditions.append(
                "사업금액: "
                f"{ExternalBidRepository._budget_label(max_budget)} "
                f"{max_operator}"
            )
        return matched_conditions

    @staticmethod
    def _document_text(row: dict[str, Any]) -> str:
        values = [
            str(row.get(key) or "")
            for key in (
                "title",
                "description",
                "category",
                "sub_category",
                "detail_category",
                "item_group_name",
                "noticer_name",
                "agency_name",
                "contract_method",
                "winner_choice_method",
                "region_restriction",
            )
        ]
        values.extend(
            str(value)
            for value in (row.get("required_licenses") or [])
        )
        if row.get("sme_only"):
            values.append("중소기업 소기업 소상공인 제한")
        return " ".join(values)[:6000]

    def _semantic_scores(
        self,
        rows: list[dict[str, Any]],
        query: str,
    ) -> dict[str, int]:
        engine = get_semantic_search_engine()
        if not query.strip() or not engine.enabled or not rows:
            return {}

        intent = parse_semantic_intent(query)
        query_vector = engine.embed([intent.normalized_query])[0]
        documents = {
            str(row["bid_number"]): self._document_text(row)
            for row in rows
        }
        hashes = {
            bid_id: hashlib.sha256(document.encode("utf-8")).hexdigest()
            for bid_id, document in documents.items()
        }
        vectors: dict[str, list[float]] = {}

        if not engine.using_fallback:
            try:
                with SessionLocal() as semantic_session:
                    repository = SemanticEmbeddingRepository(
                        semantic_session,
                        engine.engine_name,
                    )
                    vectors = repository.find_valid(hashes)
                    missing_ids = [
                        bid_id for bid_id in documents if bid_id not in vectors
                    ]
                    for start in range(0, len(missing_ids), 64):
                        batch_ids = missing_ids[start : start + 64]
                        batch_vectors = engine.embed(
                            documents[bid_id] for bid_id in batch_ids
                        )
                        created = list(
                            zip(batch_ids, batch_vectors, strict=True)
                        )
                        vectors.update(created)
                        repository.upsert_many(
                            [
                                (bid_id, hashes[bid_id], vector)
                                for bid_id, vector in created
                            ]
                        )
            except Exception:
                logger.exception(
                    "내부 임베딩 캐시를 사용할 수 없어 현재 요청에서 직접 계산합니다."
                )
                vectors = {}

        missing_ids = [bid_id for bid_id in documents if bid_id not in vectors]
        if missing_ids:
            missing_vectors = engine.embed(
                documents[bid_id] for bid_id in missing_ids
            )
            vectors.update(zip(missing_ids, missing_vectors, strict=True))

        return engine.score_vector(query_vector, vectors)

    @staticmethod
    def _semantic_ranking_enabled(request: SearchRequest) -> bool:
        return (
            bool(request.semantic_query.strip())
            and bool(analyze_query(request.semantic_query).anchor_terms)
            and get_semantic_search_engine().enabled
        )

    @classmethod
    def _preferred_region_priority(
        cls,
        row: dict[str, Any],
        preferred_regions: tuple[str, ...],
    ) -> int:
        if not preferred_regions:
            return 0

        participant_region = cls._participant_region(row)
        if participant_region == "전국":
            return 1

        locality_text = str(row.get("region_name") or "").strip().lower()
        if any(
            any(alias in locality_text for alias in region_aliases(region))
            for region in preferred_regions
        ):
            return 2
        return 0

    @classmethod
    def _prioritize_semantic_rows(
        cls,
        rows: list[dict[str, Any]],
        intent: SemanticIntent,
        semantic_scores: dict[str, int],
    ) -> list[dict[str, Any]]:
        ranked: list[
            tuple[
                tuple[int, int, int, int, int, int],
                int,
                int,
                dict[str, Any],
            ]
        ] = []
        for row in rows:
            bid_id = str(row["bid_number"])
            document = cls._document_text(row)
            lexical_rank = semantic_lexical_rank(
                title=str(row.get("title") or ""),
                document=document,
                intent=intent,
            )
            ranked.append(
                (
                    lexical_rank,
                    cls._preferred_region_priority(
                        row,
                        intent.analysis.preferred_regions,
                    ),
                    semantic_scores.get(bid_id, 0),
                    row,
                )
            )

        semantic_conditions = [
            condition
            for condition in intent.conditions
            if condition.kind == "semantic"
        ]
        must_conditions = [
            condition
            for condition in semantic_conditions
            if condition.mode == "must"
        ]
        should_conditions = [
            condition
            for condition in semantic_conditions
            if condition.mode == "should"
        ]
        must_not_conditions = [
            condition
            for condition in semantic_conditions
            if condition.mode == "must_not"
        ]

        if must_not_conditions:
            ranked = [
                item
                for item in ranked
                if not any(
                    condition_matches(cls._document_text(item[3]), condition)
                    for condition in must_not_conditions
                )
            ]
        if must_conditions:
            ranked = [
                item
                for item in ranked
                if all(
                    condition_matches(cls._document_text(item[3]), condition)
                    for condition in must_conditions
                )
            ]
        if should_conditions:
            preferred_matches = [
                item
                for item in ranked
                if any(
                    condition_matches(cls._document_text(item[3]), condition)
                    for condition in should_conditions
                )
            ]
            if preferred_matches:
                ranked = preferred_matches
        elif intent.constraint_terms:
            ranked = [
                item
                for item in ranked
                if matches_semantic_constraints(
                    cls._document_text(item[3]),
                    intent,
                )
            ]

        ranked.sort(
            key=lambda item: (
                item[0][0],
                item[0][1],
                item[0][2],
                item[0][3],
                item[1],
                item[0][4],
                item[0][5],
                item[2],
            ),
            reverse=True,
        )
        return [item[3] for item in ranked]

    @classmethod
    def _semantic_candidates(
        cls,
        rows: list[dict[str, Any]],
        intent: SemanticIntent,
        semantic_scores: dict[str, int],
    ) -> tuple[list[dict[str, Any]], int]:
        semantic_conditions = [
            condition
            for condition in intent.conditions
            if condition.kind == "semantic"
        ]
        must_conditions = [
            condition
            for condition in semantic_conditions
            if condition.mode == "must"
        ]
        should_conditions = [
            condition
            for condition in semantic_conditions
            if condition.mode == "should"
        ]
        passed_ids = set(semantic_scores)
        preserved_ids: set[str] = set()

        for row in rows:
            bid_id = str(row["bid_number"])
            if bid_id in passed_ids:
                continue
            document = cls._document_text(row)
            if must_conditions and all(
                condition_matches(document, condition)
                for condition in must_conditions
            ):
                preserved_ids.add(bid_id)
            elif not must_conditions and should_conditions and any(
                condition_matches(document, condition)
                for condition in should_conditions
            ):
                preserved_ids.add(bid_id)
            elif (
                not must_conditions
                and not should_conditions
                and intent.constraint_terms
                and matches_semantic_constraints(document, intent)
            ):
                preserved_ids.add(bid_id)

        candidate_ids = passed_ids | preserved_ids
        return (
            [
                row
                for row in rows
                if str(row["bid_number"]) in candidate_ids
            ],
            len(preserved_ids),
        )

    def _to_record(
        self,
        row: dict[str, Any],
        request: SearchRequest | None = None,
        semantic_similarity: int | None = None,
    ) -> BidRecord:
        request = request or SearchRequest()
        budget = int(row.get("estimated_price") or 0)
        corpus = " ".join(
            str(row.get(key) or "")
            for key in (
                "title",
                "description",
                "category",
                "sub_category",
                "detail_category",
                "item_group_name",
            )
        ).lower()
        requirements = [
            *list(row.get("required_licenses") or []),
            *(
                [f"지역 제한: {row['region_restriction']}"]
                if row.get("region_restriction")
                else []
            ),
            *(["중소기업 제한"] if row.get("sme_only") else []),
        ]
        tags = list(
            dict.fromkeys(
                str(row[key])
                for key in (
                    "category",
                    "sub_category",
                    "detail_category",
                    "item_group_name",
                )
                if row.get(key)
            )
        )
        announce_date = row.get("announce_date")
        is_new = bool(
            announce_date
            and (
                datetime.now(timezone.utc)
                - (
                    announce_date
                    if announce_date.tzinfo
                    else announce_date.replace(tzinfo=timezone.utc)
                )
            ).days
            <= 7
        )
        days_left = self._days_left(row.get("deadline"))
        participant_region = self._participant_region(row)
        company_profile = (
            request.company_profile.model_dump(by_alias=False)
            if request.company_profile is not None
            else COMPANY_PROFILE
        )
        hybrid_score = calculate_hybrid_score(
            corpus=corpus,
            budget=budget,
            days_left=days_left,
            deadline_known=row.get("deadline") is not None,
            is_new=is_new,
            required_licenses=[
                str(value) for value in (row.get("required_licenses") or [])
            ],
            region_restriction=participant_region,
            sme_only=bool(row.get("sme_only")),
            request=request,
            company_profile=company_profile,
            semantic_similarity=semantic_similarity,
            license_data_known=row.get("required_licenses") is not None,
        )

        return BidRecord.model_validate(
            {
                "id": str(row["bid_number"]),
                "notice_no": str(row["bid_number"]),
                "category": self._category(row),
                "title": row["title"],
                "agency": row.get("noticer_name")
                or row.get("agency_name")
                or "기관 미정",
                "demand_agency": row.get("agency_name")
                or row.get("noticer_name")
                or "기관 미정",
                "region": participant_region,
                "budget": budget,
                "budget_label": self._budget_label(budget),
                "contract_method": row.get("contract_method") or "확인 필요",
                "award_method": row.get("winner_choice_method") or "확인 필요",
                "close_at": self._close_at(row.get("deadline")),
                "days_left": days_left,
                "score": hybrid_score.score,
                "score_confidence": hybrid_score.confidence,
                "score_breakdown": hybrid_score.breakdown,
                "score_reasons": hybrid_score.reasons,
                "unresolved_requirements": hybrid_score.unresolved_requirements,
                "eligibility": hybrid_score.eligibility,
                "summary": (row.get("description") or "")[:1000],
                "matched": hybrid_score.matched,
                "matched_conditions": self._matched_search_conditions(
                    row,
                    request,
                ),
                "requirements": requirements,
                "risks": hybrid_score.unresolved_requirements,
                "tags": tags,
                "is_new": is_new,
                "source_url": row.get("source_url"),
                "attachments": self._attachments(row.get("attachments")),
                "raw_data": {
                    "externalId": row.get("id"),
                    "bidType": row.get("bid_type"),
                    "announceDate": (
                        announce_date.isoformat() if announce_date else None
                    ),
                    "openDate": (
                        row["open_date"].isoformat()
                        if row.get("open_date")
                        else None
                    ),
                    "semanticSimilarity": semantic_similarity,
                },
            }
        )

    @staticmethod
    def _columns(include_attachments: bool = False) -> str:
        attachments_column = ", b.attachments" if include_attachments else ""
        return f"""
            b.id, b.bid_number, b.bid_type, b.title, b.description,
            b.category, b.sub_category, b.detail_category, b.estimated_price,
            b.budget_amount, b.base_price, b.contract_method, b.announce_date,
            b.deadline, b.open_date, b.required_licenses, b.region_restriction,
            b.sme_only, b.source_url, b.noticer_name, b.agency_name,
            b.region_name, b.item_group_name, b.winner_choice_method
            {attachments_column}
        """

    @staticmethod
    def _corpus() -> str:
        return """
            lower(concat_ws(' ', b.title, b.description, b.category,
                b.sub_category, b.detail_category, b.item_group_name))
        """

    @staticmethod
    def _semantic_corpus() -> str:
        return """
            lower(concat_ws(' ', b.title, b.description, b.category,
                b.sub_category, b.detail_category, b.item_group_name,
                b.noticer_name, b.agency_name, b.contract_method,
                b.winner_choice_method, b.region_restriction,
                b.required_licenses,
                CASE WHEN b.sme_only THEN '중소기업 소기업 소상공인 제한'
                     ELSE '' END))
        """

    def get(self, bid_id: str) -> BidRecord | None:
        statement = text(
            f"""
            SELECT {self._columns(include_attachments=True)}
            FROM {self.table_name} AS b
            WHERE b.bid_number = :bid_id OR CAST(b.id AS text) = :bid_id
            LIMIT 1
            """
        )
        row = self.session.execute(statement, {"bid_id": bid_id}).mappings().first()
        return self._to_record(dict(row)) if row else None

    def count_all(self) -> int:
        statement = text(f"SELECT count(*) FROM {self.table_name}")
        return int(self.session.execute(statement).scalar_one())

    def _search_parts(
        self,
        request: SearchRequest,
    ) -> tuple[list[str], dict[str, Any], str]:
        analysis = analyze_query(request.semantic_query)
        conditions = [
            "coalesce(b.status, 'open') = 'open'",
            "(b.deadline IS NULL OR b.deadline >= now())",
        ]
        params: dict[str, Any] = {}
        order_by = "b.announce_date DESC NULLS LAST, b.id DESC"

        category = analysis.category or (
            request.category
            if request.category and request.category != "전체"
            else None
        )
        if category:
            conditions.append("b.category = :category")
            params["category"] = category
        if analysis.participant_regions:
            region_conditions = [NATIONWIDE_REGION_SQL]
            for region_index, region in enumerate(analysis.participant_regions):
                prefixes = REGION_PREFIXES.get(region, (region,))
                for prefix_index, prefix in enumerate(prefixes):
                    name = (
                        f"intent_region_{region_index}_{prefix_index}"
                    )
                    region_conditions.append(
                        "(coalesce(btrim(b.region_restriction), '') <> '' "
                        f"AND b.region_name LIKE :{name})"
                    )
                    params[name] = f"{prefix}%"
            conditions.append(f"({' OR '.join(region_conditions)})")
        elif request.region and request.region != "전체 지역":
            region_conditions = [NATIONWIDE_REGION_SQL]
            prefixes = REGION_PREFIXES.get(request.region, (request.region,))
            for index, prefix in enumerate(prefixes):
                name = f"region_prefix_{index}"
                region_conditions.append(
                    "(coalesce(btrim(b.region_restriction), '') <> '' "
                    f"AND b.region_name LIKE :{name})"
                )
                params[name] = f"{prefix}%"
            conditions.append(f"({' OR '.join(region_conditions)})")
            order_by = (
                f"CASE WHEN {NATIONWIDE_REGION_SQL} THEN 1 ELSE 0 END, "
                + order_by
            )

        min_budget = (
            analysis.min_budget
            if analysis.min_budget is not None
            else request.min_budget
        )
        if min_budget:
            min_operator = (
                ">="
                if (
                    analysis.min_budget_inclusive
                    if analysis.min_budget is not None
                    else True
                )
                else ">"
            )
            conditions.append(
                "nullif(b.estimated_price, 0)"
                f" {min_operator} :min_budget"
            )
            params["min_budget"] = min_budget

        max_budget = (
            analysis.max_budget
            if analysis.max_budget is not None
            else request.max_budget
        )
        if max_budget:
            max_operator = (
                "<="
                if (
                    analysis.max_budget_inclusive
                    if analysis.max_budget is not None
                    else True
                )
                else "<"
            )
            conditions.append(
                "nullif(b.estimated_price, 0)"
                f" {max_operator} :max_budget"
            )
            params["max_budget"] = max_budget
        closing_days = (
            analysis.closing_within_days
            if analysis.closing_within_days is not None
            else request.closing_within_days
        )
        if closing_days:
            conditions.append(
                "b.deadline <= now() + make_interval(days => :closing_days)"
            )
            params["closing_days"] = closing_days

        if analysis.demand_agencies:
            agency_conditions: list[str] = []
            for index, agency in enumerate(analysis.demand_agencies):
                name = f"demand_agency_{index}"
                agency_conditions.append(
                    f"lower(coalesce(b.agency_name, '')) LIKE :{name}"
                )
                params[name] = f"%{agency.lower()}%"
            conditions.append(f"({' OR '.join(agency_conditions)})")

        if analysis.contract_methods:
            contract_conditions: list[str] = []
            for index, contract_method in enumerate(
                analysis.contract_methods
            ):
                name = f"contract_method_{index}"
                contract_conditions.append(
                    f"lower(coalesce(b.contract_method, '')) LIKE :{name}"
                )
                params[name] = f"%{contract_method.lower()}%"
            conditions.append(f"({' OR '.join(contract_conditions)})")

        includes = self._keyword_list(request)
        excludes = list(
            dict.fromkeys(
                [
                    *(
                        word.strip()
                        for word in request.exclude_keywords
                        if word.strip()
                    ),
                    *analysis.excluded_terms,
                ]
            )
        )
        corpus = self._corpus()
        if includes:
            keyword_conditions = []
            for index, word in enumerate(includes):
                name = f"include_{index}"
                keyword_conditions.append(f"{corpus} LIKE :{name}")
                params[name] = f"%{word.lower()}%"
            conditions.append(f"({' OR '.join(keyword_conditions)})")
        for index, word in enumerate(excludes):
            name = f"exclude_{index}"
            conditions.append(f"{corpus} NOT LIKE :{name}")
            params[name] = f"%{word.lower()}%"

        semantic_corpus = self._semantic_corpus()
        semantic_conditions = build_search_conditions(analysis, request)
        must_conditions = [
            condition
            for condition in semantic_conditions
            if condition.kind == "semantic" and condition.mode == "must"
        ]
        must_not_conditions = [
            condition
            for condition in semantic_conditions
            if condition.kind == "semantic" and condition.mode == "must_not"
        ]
        for condition_index, semantic_condition in enumerate(must_conditions):
            variant_conditions: list[str] = []
            for variant_index, variant in enumerate(semantic_condition.variants):
                name = f"semantic_must_{condition_index}_{variant_index}"
                variant_conditions.append(f"{semantic_corpus} LIKE :{name}")
                params[name] = f"%{variant.lower()}%"
            conditions.append(f"({' OR '.join(variant_conditions)})")
        for condition_index, semantic_condition in enumerate(must_not_conditions):
            variant_conditions = []
            for variant_index, variant in enumerate(semantic_condition.variants):
                name = f"semantic_must_not_{condition_index}_{variant_index}"
                variant_conditions.append(f"{semantic_corpus} LIKE :{name}")
                params[name] = f"%{variant.lower()}%"
            conditions.append(f"NOT ({' OR '.join(variant_conditions)})")

        return conditions, params, order_by

    def _ranked_records(self, request: SearchRequest) -> list[BidRecord]:
        self.last_search_trace = []
        conditions, params, order_by = self._search_parts(request)
        intent = parse_semantic_intent(request.semantic_query)
        semantic_enabled = self._semantic_ranking_enabled(request)
        limit_clause = ""
        if semantic_enabled:
            limit_clause = "LIMIT :semantic_candidate_limit"
            params["semantic_candidate_limit"] = (
                get_settings().semantic_candidate_limit
            )
        statement = text(
            f"""
            SELECT {self._columns()}
            FROM {self.table_name} AS b
            WHERE {' AND '.join(conditions)}
            ORDER BY {order_by}
            {limit_clause}
            """
        )
        rows = [
            dict(row)
            for row in self.session.execute(statement, params).mappings().all()
        ]
        self.last_search_trace.append(
            f"DB 조건 적용 후보: {len(rows):,}건"
        )
        semantic_scores = (
            self._semantic_scores(rows, request.semantic_query)
            if semantic_enabled
            else {}
        )
        if semantic_enabled:
            self.last_search_trace.append(
                f"임베딩 유사도 통과: {len(semantic_scores):,}건"
            )
            rows, preserved_count = self._semantic_candidates(
                rows,
                intent,
                semantic_scores,
            )
            self.last_search_trace.append(
                f"명시 조건으로 추가 보존: {preserved_count:,}건"
            )
            semantic_count = len(rows)
            rows = self._prioritize_semantic_rows(
                rows,
                intent,
                semantic_scores,
            )
            self.last_search_trace.append(
                "지식사전·핵심어 재정렬: "
                f"{semantic_count:,}건 → {len(rows):,}건"
            )
        records = [
            self._to_record(
                row,
                request,
                semantic_scores.get(str(row["bid_number"])),
            )
            for row in rows
        ]
        preferred_regions = intent.analysis.preferred_regions or (
            (request.region,)
            if request.region and request.region != "전체 지역"
            else ()
        )
        region_priority_by_id = {
            str(row["bid_number"]): self._preferred_region_priority(
                row,
                preferred_regions,
            )
            for row in rows
        }
        if request.only_eligible:
            records = [
                record for record in records if record.eligibility == "참가 가능"
            ]
        if semantic_enabled:
            record_order = {
                str(row["bid_number"]): index
                for index, row in enumerate(rows)
            }
            return sorted(
                records,
                key=lambda item: (
                    record_order.get(item.id, len(record_order)),
                    -item.score,
                ),
            )
        return sorted(
            records,
            key=lambda item: (
                region_priority_by_id.get(item.id, 0),
                item.score,
            ),
            reverse=True,
        )

    def search_with_metrics(
        self,
        request: SearchRequest,
    ) -> tuple[list[BidRecord], int, int]:
        ranked_records, total, average_score, _, _ = (
            self.search_with_dashboard_metrics(request)
        )
        start = (request.page - 1) * request.limit
        return (
            ranked_records[start : start + request.limit],
            total,
            average_score,
        )

    @staticmethod
    def _closes_within(record: BidRecord, days: int | None) -> bool:
        if not days:
            return True
        return (
            record.close_at != "마감일 미정"
            and record.days_left <= days
        )

    @staticmethod
    def _matches_eligibility(record: BidRecord, request: SearchRequest) -> bool:
        if request.eligibility_mode == "not_eligible":
            return record.eligibility != "참가 가능"
        return not request.only_eligible or record.eligibility == "참가 가능"

    def search_with_dashboard_metrics(
        self,
        request: SearchRequest,
    ) -> tuple[list[BidRecord], int, int, int, int]:
        analysis = analyze_query(request.semantic_query)
        closing_within_days = (
            analysis.closing_within_days
            if analysis.closing_within_days is not None
            else request.closing_within_days
        )
        base_request = request.model_copy(
            update={
                "only_eligible": False,
                "closing_within_days": None,
                "page": 1,
            }
        )
        base_records = self._ranked_records(base_request)

        records = [
            record
            for record in base_records
            if self._closes_within(record, closing_within_days)
            and self._matches_eligibility(record, request)
        ]
        if request.sort_mode == "opportunity":
            records.sort(
                key=lambda record: (
                    record.days_left,
                    -record.score,
                    record.id,
                )
            )
        elif request.sort_mode == "latest":
            records.sort(
                key=lambda record: str(
                    record.raw_data.get("announceDate") or ""
                ),
                reverse=True,
            )
        total = len(records)
        average_score = (
            round(sum(record.score for record in records) / total)
            if total
            else 0
        )
        eligible_total = sum(
            record.eligibility == "참가 가능"
            and self._closes_within(record, closing_within_days)
            for record in base_records
        )
        closing_days = min(closing_within_days or 7, 7)
        closing_soon_total = sum(
            self._closes_within(record, closing_days)
            and (
                not request.only_eligible
                or record.eligibility == "참가 가능"
            )
            for record in base_records
        )
        return records, total, average_score, eligible_total, closing_soon_total

    def search_with_total(
        self,
        request: SearchRequest,
    ) -> tuple[list[BidRecord], int]:
        records, total, _ = self.search_with_metrics(request)
        return records, total

    def search(self, request: SearchRequest) -> list[BidRecord]:
        records, _ = self.search_with_total(request)
        return records

    def count_search(self, request: SearchRequest) -> int:
        semantic_enabled = self._semantic_ranking_enabled(request)
        if request.only_eligible or semantic_enabled:
            return len(self._ranked_records(request))
        conditions, params, _ = self._search_parts(request)
        statement = text(
            f"""
            SELECT count(*)
            FROM {self.table_name} AS b
            WHERE {' AND '.join(conditions)}
            """
        )
        return int(self.session.execute(statement, params).scalar_one())
