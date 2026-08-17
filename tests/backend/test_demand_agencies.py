from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.models.demand_agency import DemandAgency, DemandAgencySyncRun
from app.repositories.demand_agency_repository import DemandAgencyRepository
from app.services.demand_agency_sync import (
    DemandAgencySyncAlreadyDone,
    DemandAgencySyncManager,
    DemandAgencySyncRunning,
    G2BDemandAgencyClient,
    map_demand_agency,
    normalize_agency_name,
)


def test_force_sync_bypasses_only_the_daily_completion_limit(monkeypatch) -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[DemandAgencySyncRun.__table__])
    test_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with test_session() as session:
        now = datetime.now(timezone.utc)
        session.add(DemandAgencySyncRun(
            trigger="startup",
            status="success",
            started_at=now,
            finished_at=now,
        ))
        session.commit()

    class DummyThread:
        def __init__(self, **_kwargs):
            self.started = False

        def is_alive(self):
            return False

        def start(self):
            self.started = True

    monkeypatch.setattr("app.services.demand_agency_sync.SessionLocal", test_session)
    monkeypatch.setattr(
        "app.services.demand_agency_sync.get_settings",
        lambda: SimpleNamespace(
            demand_agency_sync_enabled=True,
            g2b_api_key="테스트 키",
            g2b_service_key="",
        ),
    )
    monkeypatch.setattr("app.services.demand_agency_sync.threading.Thread", DummyThread)
    manager = DemandAgencySyncManager()

    with pytest.raises(DemandAgencySyncAlreadyDone):
        manager.start("admin")

    run = manager.start("admin_force", force=True, request_ip="203.0.113.25")
    assert run["trigger"] == "admin_force"
    assert run["requestIp"] == "203.0.113.25"
    assert run["status"] == "running"
    with pytest.raises(DemandAgencySyncRunning):
        manager.start("admin_force", force=True)


def test_demand_agency_api_item_is_mapped_to_local_columns() -> None:
    synced_at = datetime(2026, 8, 11, tzinfo=timezone.utc)
    mapped = map_demand_agency(
        {
            "dminsttCd": "1234567",
            "dminsttNm": "충남 대학교 산학협력단",
            "dminsttAbrvtNm": "충남대 산단",
            "jrsdctnDivNm": "공공기관",
            "insttTyCdLrgclsfcNm": "대학교",
            "insttTyCdMidclsfcNm": "국립대학교",
            "insttTyCdSmlclsfcNm": "산학협력단",
            "toplvlInsttCd": "7654321",
            "toplvlInsttNm": "충남대학교",
            "rgnNm": "대전광역시",
            "dltYn": "N",
            "rgstDt": "2026-08-10 09:00:00",
            "chgDt": "2026-08-11 10:00:00",
        },
        synced_at,
    )

    assert mapped["code"] == "1234567"
    assert mapped["name"] == "충남 대학교 산학협력단"
    assert mapped["normalized_name"] == "충남대학교산학협력단"
    assert mapped["detail_type_large"] == "대학교"
    assert mapped["top_level_agency_name"] == "충남대학교"
    assert mapped["deleted"] is False
    assert mapped["synced_at"] == synced_at
    assert normalize_agency_name("태양광 ㆍ 발전") == "태양광발전"


def test_changed_fetch_merges_registration_and_change_date_results(monkeypatch) -> None:
    class DummyHttpClient:
        def __init__(self, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

    calls: list[int] = []
    api_client = G2BDemandAgencyClient()
    api_client.service_key = "테스트 키"

    def fake_fetch_window(_client, _start_at, _end_at, inquiry_division):
        calls.append(inquiry_division)
        if inquiry_division == 1:
            return [{"dminsttCd": "A001", "dminsttNm": "변경 전 기관"}], 1
        return [
            {"dminsttCd": "A001", "dminsttNm": "변경 후 기관"},
            {"dminsttCd": "A002", "dminsttNm": "삭제 기관", "dltYn": "Y"},
        ], 2

    monkeypatch.setattr("app.services.demand_agency_sync.httpx.Client", DummyHttpClient)
    monkeypatch.setattr(api_client, "fetch_window", fake_fetch_window)
    start_at = datetime(2026, 8, 11, 0, 0, tzinfo=timezone.utc)
    items, api_total = api_client.fetch_changed(start_at, start_at)

    assert calls == [1, 2]
    assert api_total == 3
    assert len(items) == 2
    assert next(item for item in items if item["dminsttCd"] == "A001")["dminsttNm"] == "변경 후 기관"


def test_admin_demand_agencies_are_filtered_and_paginated() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[DemandAgency.__table__, DemandAgencySyncRun.__table__],
    )
    now = datetime(2026, 8, 11, tzinfo=timezone.utc)

    with Session(engine) as session:
        session.add_all([
            DemandAgency(
                code="A001",
                name="충남대학교 산학협력단",
                normalized_name="충남대학교산학협력단",
                jurisdiction_type="공공기관",
                detail_type_large="대학교",
                top_level_agency_name="충남대학교",
                region_name="대전광역시",
                deleted=False,
                synced_at=now,
            ),
            DemandAgency(
                code="A002",
                name="폐지된 기관",
                normalized_name="폐지된기관",
                jurisdiction_type="지방자치단체",
                detail_type_large="산하기관",
                top_level_agency_name="충청남도",
                deleted=True,
                synced_at=now,
            ),
        ])
        session.add(DemandAgencySyncRun(
            trigger="admin",
            request_ip="2001:db8::1",
            status="success",
            started_at=now,
            finished_at=now,
            inquiry_start="202608100000",
            inquiry_end="202608112359",
            received_count=1,
            updated_count=1,
        ))
        session.commit()

        result = DemandAgencyRepository(session).admin_list(
            page=1,
            page_size=15,
            query="충남대학교",
            jurisdiction_type="공공기관",
            detail_type="대학교",
            agency_status="active",
        )

    assert result["summary"] == {"total": 2, "active": 1, "deleted": 1}
    assert result["pagination"]["total"] == 1
    assert result["pagination"]["pageSize"] == 15
    assert result["items"][0]["name"] == "충남대학교 산학협력단"
    assert result["items"][0]["topLevelAgencyName"] == "충남대학교"
    assert result["sync"]["latestSuccess"]["status"] == "success"
    assert result["sync"]["latestSuccess"]["requestIp"] == "2001:db8::1"
    assert result["filters"]["jurisdictionTypes"] == ["공공기관", "지방자치단체"]


def test_sync_history_is_deleted_only_when_no_sync_is_running() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[DemandAgencySyncRun.__table__])
    with Session(engine) as session:
        session.add_all([
            DemandAgencySyncRun(trigger="admin", status="success"),
            DemandAgencySyncRun(trigger="scheduled", status="running"),
        ])
        session.commit()
        repository = DemandAgencyRepository(session)

        assert repository.delete_sync_history() is None
        running = session.query(DemandAgencySyncRun).filter_by(status="running").one()
        running.status = "success"
        session.commit()

        assert repository.delete_sync_history() == 2
        assert session.query(DemandAgencySyncRun).count() == 0
