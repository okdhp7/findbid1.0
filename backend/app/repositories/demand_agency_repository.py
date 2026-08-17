from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.models.demand_agency import DemandAgency, DemandAgencySyncRun


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def _run_item(run: DemandAgencySyncRun | None) -> dict[str, Any] | None:
    if run is None:
        return None
    return {
        "id": run.id,
        "trigger": run.trigger,
        "requestIp": run.request_ip,
        "status": run.status,
        "startedAt": _iso(run.started_at),
        "finishedAt": _iso(run.finished_at),
        "inquiryStart": run.inquiry_start,
        "inquiryEnd": run.inquiry_end,
        "apiTotal": run.api_total,
        "receivedCount": run.received_count,
        "createdCount": run.created_count,
        "updatedCount": run.updated_count,
        "deletedCount": run.deleted_count,
        "errorMessage": run.error_message,
    }


class DemandAgencyRepository:
    def __init__(self, session: Session):
        self.session = session

    def delete_sync_history(self) -> int | None:
        running = self.session.scalar(
            select(DemandAgencySyncRun.id)
            .where(DemandAgencySyncRun.status == "running")
            .limit(1)
        )
        if running is not None:
            return None
        result = self.session.execute(
            delete(DemandAgencySyncRun).where(DemandAgencySyncRun.status != "running")
        )
        self.session.commit()
        return int(result.rowcount or 0)

    def admin_list(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        query: str = "",
        jurisdiction_type: str = "",
        detail_type: str = "",
        agency_status: str = "active",
    ) -> dict[str, Any]:
        safe_page = max(1, page)
        safe_page_size = max(1, min(page_size, 100))
        conditions = []
        cleaned_query = query.strip()
        if cleaned_query:
            contains = f"%{cleaned_query}%"
            conditions.append(or_(
                DemandAgency.name.ilike(contains),
                DemandAgency.code.ilike(contains),
                DemandAgency.top_level_agency_name.ilike(contains),
            ))
        if jurisdiction_type.strip():
            conditions.append(DemandAgency.jurisdiction_type == jurisdiction_type.strip())
        if detail_type.strip():
            conditions.append(DemandAgency.detail_type_large == detail_type.strip())
        if agency_status == "active":
            conditions.append(DemandAgency.deleted.is_(False))
        elif agency_status == "deleted":
            conditions.append(DemandAgency.deleted.is_(True))

        total_statement = select(func.count()).select_from(DemandAgency)
        list_statement = select(DemandAgency)
        if conditions:
            total_statement = total_statement.where(*conditions)
            list_statement = list_statement.where(*conditions)
        total = int(self.session.scalar(total_statement) or 0)
        agencies = list(self.session.scalars(
            list_statement
            .order_by(DemandAgency.deleted, DemandAgency.name, DemandAgency.code)
            .offset((safe_page - 1) * safe_page_size)
            .limit(safe_page_size)
        ))

        active_total = int(self.session.scalar(
            select(func.count()).select_from(DemandAgency).where(DemandAgency.deleted.is_(False))
        ) or 0)
        deleted_total = int(self.session.scalar(
            select(func.count()).select_from(DemandAgency).where(DemandAgency.deleted.is_(True))
        ) or 0)
        types = list(self.session.scalars(
            select(DemandAgency.jurisdiction_type)
            .where(DemandAgency.jurisdiction_type != "")
            .distinct()
            .order_by(DemandAgency.jurisdiction_type)
        ))
        details = list(self.session.scalars(
            select(DemandAgency.detail_type_large)
            .where(DemandAgency.detail_type_large != "")
            .distinct()
            .order_by(DemandAgency.detail_type_large)
        ))
        recent_runs = list(self.session.scalars(
            select(DemandAgencySyncRun)
            .order_by(DemandAgencySyncRun.started_at.desc(), DemandAgencySyncRun.id.desc())
            .limit(10)
        ))
        latest_success = self.session.scalar(
            select(DemandAgencySyncRun)
            .where(DemandAgencySyncRun.status == "success")
            .order_by(DemandAgencySyncRun.finished_at.desc(), DemandAgencySyncRun.id.desc())
            .limit(1)
        )
        running = self.session.scalar(
            select(DemandAgencySyncRun)
            .where(DemandAgencySyncRun.status == "running")
            .order_by(DemandAgencySyncRun.started_at.desc())
            .limit(1)
        )
        return {
            "summary": {
                "total": active_total + deleted_total,
                "active": active_total,
                "deleted": deleted_total,
            },
            "pagination": {
                "page": safe_page,
                "pageSize": safe_page_size,
                "total": total,
                "totalPages": max(1, (total + safe_page_size - 1) // safe_page_size),
            },
            "filters": {"jurisdictionTypes": types, "detailTypes": details},
            "sync": {
                "running": _run_item(running),
                "latestSuccess": _run_item(latest_success),
                "history": [_run_item(run) for run in recent_runs],
            },
            "items": [
                {
                    "code": agency.code,
                    "name": agency.name,
                    "abbreviation": agency.abbreviation,
                    "jurisdictionType": agency.jurisdiction_type,
                    "detailTypeLarge": agency.detail_type_large,
                    "detailTypeMiddle": agency.detail_type_middle,
                    "detailTypeSmall": agency.detail_type_small,
                    "topLevelAgencyCode": agency.top_level_agency_code,
                    "topLevelAgencyName": agency.top_level_agency_name,
                    "regionName": agency.region_name,
                    "deleted": agency.deleted,
                    "sourceRegisteredAt": agency.source_registered_at,
                    "sourceChangedAt": agency.source_changed_at,
                    "syncedAt": _iso(agency.synced_at),
                }
                for agency in agencies
            ],
        }


__all__ = ["DemandAgencyRepository", "_run_item"]

