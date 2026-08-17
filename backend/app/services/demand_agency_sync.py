from __future__ import annotations

import logging
import math
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.demand_agency import DemandAgency, DemandAgencySyncRun
from app.repositories.demand_agency_repository import _run_item
from findbid_shared.config import get_settings

logger = logging.getLogger(__name__)

KST = ZoneInfo("Asia/Seoul")
G2B_DEMAND_AGENCY_URL = (
    "https://apis.data.go.kr/1230000/ao/UsrInfoService02/getDminsttInfo02"
)
SYNC_LOCK_KEY = 2026081101


class DemandAgencySyncError(RuntimeError):
    pass


class DemandAgencySyncAlreadyDone(DemandAgencySyncError):
    pass


class DemandAgencySyncRunning(DemandAgencySyncError):
    pass


def _clean(value: object, max_length: int) -> str:
    return str(value or "").strip()[:max_length]


def normalize_agency_name(value: object) -> str:
    return re.sub(r"[\s·ㆍ・]+", "", str(value or "").strip()).lower()


def map_demand_agency(item: dict[str, Any], synced_at: datetime) -> dict[str, Any]:
    return {
        "code": _clean(item.get("dminsttCd"), 20),
        "name": _clean(item.get("dminsttNm"), 500),
        "normalized_name": normalize_agency_name(item.get("dminsttNm"))[:500],
        "abbreviation": _clean(item.get("dminsttAbrvtNm"), 200),
        "jurisdiction_type": _clean(item.get("jrsdctnDivNm"), 100),
        "detail_type_large": _clean(item.get("insttTyCdLrgclsfcNm"), 150),
        "detail_type_middle": _clean(item.get("insttTyCdMidclsfcNm"), 150),
        "detail_type_small": _clean(item.get("insttTyCdSmlclsfcNm"), 150),
        "top_level_agency_code": _clean(item.get("toplvlInsttCd"), 20),
        "top_level_agency_name": _clean(item.get("toplvlInsttNm"), 500),
        "region_name": _clean(item.get("rgnNm"), 300),
        "deleted": _clean(item.get("dltYn"), 1).upper() == "Y",
        "source_registered_at": _clean(item.get("rgstDt"), 30),
        "source_changed_at": _clean(item.get("chgDt"), 30),
        "synced_at": synced_at,
    }


def _parse_source_datetime(value: str) -> datetime | None:
    cleaned = str(value or "").strip()
    for pattern in ("%Y-%m-%d %H:%M:%S", "%Y%m%d%H%M", "%Y%m%d%H%M%S"):
        try:
            return datetime.strptime(cleaned, pattern).replace(tzinfo=KST)
        except ValueError:
            continue
    return None


class G2BDemandAgencyClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.service_key = settings.g2b_api_key or settings.g2b_service_key
        self.page_size = max(1, min(settings.demand_agency_sync_page_size, 999))
        self.timeout = max(5.0, settings.demand_agency_sync_timeout_seconds)

    @staticmethod
    def _items(body: dict[str, Any]) -> list[dict[str, Any]]:
        items = body.get("items", [])
        if isinstance(items, dict):
            items = items.get("item", [])
        if isinstance(items, dict):
            items = [items]
        return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []

    def _request(self, client: httpx.Client, params: dict[str, object]) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                response = client.get(G2B_DEMAND_AGENCY_URL, params=params)
                response.raise_for_status()
                payload = response.json()
                if "OpenAPI_ServiceResponse" in payload:
                    header = payload.get("OpenAPI_ServiceResponse", {}).get("cmmMsgHeader", {})
                    code = str(header.get("returnReasonCode") or "")
                    message = str(header.get("errMsg") or header.get("returnAuthMsg") or "API 오류")
                    raise DemandAgencySyncError(f"공공데이터포털 오류 {code}: {message}")
                api_response = payload.get("response", {})
                header = api_response.get("header", {})
                result_code = str(header.get("resultCode") or "")
                if result_code not in {"", "00"}:
                    result_message = str(header.get("resultMsg") or "API 오류")
                    if result_code == "03":
                        return {"totalCount": 0, "items": []}
                    raise DemandAgencySyncError(
                        f"나라장터 API 오류 {result_code}: {result_message}"
                    )
                body = api_response.get("body", {})
                return {
                    "totalCount": int(body.get("totalCount") or 0),
                    "items": self._items(body),
                }
            except (httpx.HTTPError, ValueError, DemandAgencySyncError) as error:
                last_error = error
                if attempt < 3:
                    time.sleep(attempt * 1.5)
        raise DemandAgencySyncError(str(last_error or "나라장터 API 응답을 처리하지 못했습니다."))

    def fetch_window(
        self,
        client: httpx.Client,
        start_at: datetime,
        end_at: datetime,
        inquiry_division: int,
    ) -> tuple[list[dict[str, Any]], int]:
        common_params: dict[str, object] = {
            "serviceKey": self.service_key,
            "numOfRows": self.page_size,
            "inqryDiv": inquiry_division,
            "inqryBgnDt": start_at.astimezone(KST).strftime("%Y%m%d%H%M"),
            "inqryEndDt": end_at.astimezone(KST).strftime("%Y%m%d%H%M"),
            "type": "json",
        }
        first = self._request(client, {**common_params, "pageNo": 1})
        total = int(first["totalCount"])
        items = list(first["items"])
        for page in range(2, math.ceil(total / self.page_size) + 1):
            page_data = self._request(client, {**common_params, "pageNo": page})
            items.extend(page_data["items"])
        return items, total

    def fetch_changed(
        self,
        start_at: datetime,
        end_at: datetime,
    ) -> tuple[list[dict[str, Any]], int]:
        if not self.service_key:
            raise DemandAgencySyncError("G2B_API_KEY 환경변수가 설정되지 않았습니다.")
        settings = get_settings()
        window_days = max(1, min(settings.demand_agency_sync_window_days, 31))
        received: dict[str, dict[str, Any]] = {}
        api_total = 0
        cursor = start_at.astimezone(KST)
        end_at = end_at.astimezone(KST)
        timeout = httpx.Timeout(self.timeout, connect=min(self.timeout, 10.0))
        with httpx.Client(timeout=timeout) as client:
            while cursor <= end_at:
                window_end = min(
                    end_at,
                    cursor + timedelta(days=window_days) - timedelta(minutes=1),
                )
                # 조회구분 1은 등록일, 2는 변경일 기준이다. 두 결과를 기관코드로
                # 합쳐야 신규 기관뿐 아니라 명칭 변경과 삭제까지 반영할 수 있다.
                for inquiry_division in (1, 2):
                    items, total = self.fetch_window(
                        client,
                        cursor,
                        window_end,
                        inquiry_division,
                    )
                    api_total += total
                    for item in items:
                        code = _clean(item.get("dminsttCd"), 20)
                        if code:
                            received[code] = item
                cursor = window_end + timedelta(minutes=1)
        return list(received.values()), api_total


class DemandAgencySyncManager:
    def __init__(self) -> None:
        self._guard = threading.Lock()
        self._thread: threading.Thread | None = None

    @staticmethod
    def _today_bounds() -> tuple[datetime, datetime]:
        now = datetime.now(KST)
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)

    @staticmethod
    def _latest_success_today(session: Session) -> DemandAgencySyncRun | None:
        start, end = DemandAgencySyncManager._today_bounds()
        return session.scalar(
            select(DemandAgencySyncRun)
            .where(
                DemandAgencySyncRun.status == "success",
                DemandAgencySyncRun.finished_at >= start,
                DemandAgencySyncRun.finished_at < end,
            )
            .order_by(DemandAgencySyncRun.finished_at.desc())
            .limit(1)
        )

    @staticmethod
    def _automatic_attempt_today(session: Session) -> DemandAgencySyncRun | None:
        start, end = DemandAgencySyncManager._today_bounds()
        return session.scalar(
            select(DemandAgencySyncRun)
            .where(
                DemandAgencySyncRun.trigger.in_(("startup", "scheduled")),
                DemandAgencySyncRun.started_at >= start,
                DemandAgencySyncRun.started_at < end,
            )
            .order_by(DemandAgencySyncRun.started_at.desc())
            .limit(1)
        )

    @staticmethod
    def _mark_stale_runs(session: Session) -> None:
        stale_before = datetime.now(timezone.utc) - timedelta(hours=2)
        stale_runs = list(session.scalars(
            select(DemandAgencySyncRun).where(
                DemandAgencySyncRun.status == "running",
                DemandAgencySyncRun.started_at < stale_before,
            )
        ))
        for run in stale_runs:
            run.status = "failed"
            run.finished_at = datetime.now(timezone.utc)
            run.error_message = "비정상 종료로 실행 상태가 정리되었습니다."

    def start(
        self,
        trigger: str = "admin",
        *,
        force: bool = False,
        request_ip: str = "",
    ) -> dict[str, Any]:
        settings = get_settings()
        if not settings.demand_agency_sync_enabled:
            raise DemandAgencySyncError("수요기관 자동 동기화가 비활성화되어 있습니다.")
        if not (settings.g2b_api_key or settings.g2b_service_key):
            raise DemandAgencySyncError("G2B_API_KEY 환경변수가 설정되지 않았습니다.")
        with self._guard:
            if self._thread is not None and self._thread.is_alive():
                raise DemandAgencySyncRunning("수요기관 정보를 이미 가져오고 있습니다.")
            with SessionLocal() as session:
                self._mark_stale_runs(session)
                running = session.scalar(
                    select(DemandAgencySyncRun)
                    .where(DemandAgencySyncRun.status == "running")
                    .limit(1)
                )
                if running is not None:
                    session.commit()
                    raise DemandAgencySyncRunning("수요기관 정보를 이미 가져오고 있습니다.")
                if not force and self._latest_success_today(session) is not None:
                    session.commit()
                    raise DemandAgencySyncAlreadyDone("오늘 수요기관 정보 동기화를 완료했습니다.")
                if (
                    not force
                    and trigger != "admin"
                    and self._automatic_attempt_today(session) is not None
                ):
                    session.commit()
                    raise DemandAgencySyncAlreadyDone("오늘 자동 동기화를 이미 시도했습니다.")
                run = DemandAgencySyncRun(
                    trigger=trigger,
                    request_ip=_clean(request_ip, 45),
                    status="running",
                )
                session.add(run)
                session.commit()
                session.refresh(run)
                result = _run_item(run) or {}
                run_id = run.id
            self._thread = threading.Thread(
                target=self._execute,
                args=(run_id,),
                name=f"demand-agency-sync-{run_id}",
                daemon=True,
            )
            self._thread.start()
            return result

    def start_if_due(self, trigger: str) -> dict[str, Any] | None:
        try:
            return self.start(trigger)
        except (DemandAgencySyncAlreadyDone, DemandAgencySyncRunning):
            return None
        except DemandAgencySyncError:
            logger.exception("수요기관 자동 동기화를 시작하지 못했습니다.")
            return None

    @staticmethod
    def _inquiry_range(session: Session) -> tuple[datetime, datetime]:
        settings = get_settings()
        end_at = datetime.now(KST).replace(second=0, microsecond=0)
        latest_success = session.scalar(
            select(DemandAgencySyncRun)
            .where(DemandAgencySyncRun.status == "success")
            .order_by(DemandAgencySyncRun.finished_at.desc())
            .limit(1)
        )
        source_value = latest_success.inquiry_end if latest_success else ""
        source_at = _parse_source_datetime(source_value)
        if source_at is None:
            latest_source = session.scalar(select(func.max(DemandAgency.source_changed_at))) or ""
            source_at = _parse_source_datetime(str(latest_source))
        if source_at is None:
            source_at = _parse_source_datetime(settings.demand_agency_sync_initial_date)
        if source_at is None:
            source_at = end_at - timedelta(days=31)
        start_at = source_at - timedelta(days=max(0, settings.demand_agency_sync_overlap_days))
        return min(start_at, end_at), end_at

    @staticmethod
    def _apply(session: Session, raw_items: list[dict[str, Any]]) -> tuple[int, int, int]:
        synced_at = datetime.now(timezone.utc)
        mapped = [map_demand_agency(item, synced_at) for item in raw_items]
        mapped = [item for item in mapped if item["code"] and item["name"]]
        by_code = {item["code"]: item for item in mapped}
        existing: dict[str, DemandAgency] = {}
        codes = list(by_code)
        for offset in range(0, len(codes), 1000):
            chunk = codes[offset:offset + 1000]
            existing.update({
                agency.code: agency
                for agency in session.scalars(
                    select(DemandAgency).where(DemandAgency.code.in_(chunk))
                )
            })
        created_count = 0
        updated_count = 0
        deleted_count = 0
        comparable_fields = tuple(
            field for field in next(iter(by_code.values()), {}) if field != "synced_at"
        )
        for code, values in by_code.items():
            agency = existing.get(code)
            if agency is None:
                session.add(DemandAgency(**values))
                created_count += 1
                if values["deleted"]:
                    deleted_count += 1
                continue
            changed = any(getattr(agency, field) != values[field] for field in comparable_fields)
            if values["deleted"] and not agency.deleted:
                deleted_count += 1
            if changed:
                updated_count += 1
            for field, value in values.items():
                setattr(agency, field, value)
        return created_count, updated_count, deleted_count

    def _execute(self, run_id: int) -> None:
        with SessionLocal() as session:
            lock_acquired = False
            try:
                lock_acquired = bool(session.scalar(
                    text("SELECT pg_try_advisory_lock(:lock_key)"),
                    {"lock_key": SYNC_LOCK_KEY},
                ))
                if not lock_acquired:
                    raise DemandAgencySyncRunning("다른 서버에서 수요기관 정보를 가져오고 있습니다.")
                run = session.get(DemandAgencySyncRun, run_id)
                if run is None:
                    raise DemandAgencySyncError("동기화 실행 이력을 찾을 수 없습니다.")
                start_at, end_at = self._inquiry_range(session)
                run.inquiry_start = start_at.astimezone(KST).strftime("%Y%m%d%H%M")
                run.inquiry_end = end_at.astimezone(KST).strftime("%Y%m%d%H%M")
                session.commit()

                raw_items, api_total = G2BDemandAgencyClient().fetch_changed(start_at, end_at)
                created, updated, deleted = self._apply(session, raw_items)
                run = session.get(DemandAgencySyncRun, run_id)
                if run is None:
                    raise DemandAgencySyncError("동기화 실행 이력을 찾을 수 없습니다.")
                run.api_total = api_total
                run.received_count = len({str(item.get("dminsttCd") or "") for item in raw_items})
                run.created_count = created
                run.updated_count = updated
                run.deleted_count = deleted
                run.status = "success"
                run.finished_at = datetime.now(timezone.utc)
                run.error_message = ""
                session.commit()
                logger.info(
                    "수요기관 동기화 완료: 수신 %s건, 신규 %s건, 변경 %s건, 삭제 %s건",
                    run.received_count,
                    created,
                    updated,
                    deleted,
                )
            except Exception as error:
                session.rollback()
                run = session.get(DemandAgencySyncRun, run_id)
                if run is not None:
                    run.status = "failed"
                    run.finished_at = datetime.now(timezone.utc)
                    run.error_message = str(error)[:4000]
                    session.commit()
                logger.exception("수요기관 정보 동기화에 실패했습니다.")
            finally:
                if lock_acquired:
                    try:
                        session.execute(
                            text("SELECT pg_advisory_unlock(:lock_key)"),
                            {"lock_key": SYNC_LOCK_KEY},
                        )
                        session.commit()
                    except Exception:
                        session.rollback()


_manager = DemandAgencySyncManager()


def demand_agency_sync_manager() -> DemandAgencySyncManager:
    return _manager


__all__ = [
    "DemandAgencySyncAlreadyDone",
    "DemandAgencySyncError",
    "DemandAgencySyncRunning",
    "demand_agency_sync_manager",
    "map_demand_agency",
    "normalize_agency_name",
]
