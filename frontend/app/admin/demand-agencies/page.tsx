"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type AgencyItem = {
  code: string;
  name: string;
  abbreviation: string;
  jurisdictionType: string;
  detailTypeLarge: string;
  detailTypeMiddle: string;
  detailTypeSmall: string;
  topLevelAgencyCode: string;
  topLevelAgencyName: string;
  regionName: string;
  deleted: boolean;
  sourceRegisteredAt: string;
  sourceChangedAt: string;
  syncedAt: string;
};

type SyncRun = {
  id: number;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  inquiryStart: string;
  inquiryEnd: string;
  apiTotal: number;
  receivedCount: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  errorMessage: string;
};

type AgencyResponse = {
  summary: { total: number; active: number; deleted: number };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  filters: { jurisdictionTypes: string[]; detailTypes: string[] };
  sync: { running: SyncRun | null; latestSuccess: SyncRun | null; history: SyncRun[] };
  items: AgencyItem[];
  detail?: string;
};

const PAGE_SIZE = 20;
const PAGE_JUMP = 5;
const EMPTY_RESPONSE: AgencyResponse = {
  summary: { total: 0, active: 0, deleted: 0 },
  pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 },
  filters: { jurisdictionTypes: [], detailTypes: [] },
  sync: { running: null, latestSuccess: null, history: [] },
  items: [],
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

function displayDate(value: string | null) {
  if (!value) return "없음";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function inquiryDate(value: string) {
  if (!/^\d{12}$/.test(value)) return value || "없음";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}`;
}

function triggerLabel(value: string) {
  if (value === "admin") return "관리자 실행";
  if (value === "admin_force") return "관리자 강제 실행";
  if (value === "startup") return "서버 시작";
  if (value === "scheduled") return "정기 실행";
  return value;
}

function statusLabel(value: string) {
  if (value === "success") return "완료";
  if (value === "failed") return "실패";
  if (value === "running") return "진행 중";
  return value;
}

function completedToday(run: SyncRun | null) {
  if (!run?.finishedAt) return false;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const finished = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(run.finishedAt));
  return today === finished;
}

export default function AdminDemandAgenciesPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [data, setData] = useState<AgencyResponse>(EMPTY_RESPONSE);
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [jurisdictionType, setJurisdictionType] = useState("");
  const [detailType, setDetailType] = useState("");
  const [agencyStatus, setAgencyStatus] = useState("active");
  const [loading, setLoading] = useState(false);
  const [syncStarting, setSyncStarting] = useState(false);
  const [syncMessageRunId, setSyncMessageRunId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const loadAgencies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        q: query,
        jurisdictionType,
        detailType,
        status: agencyStatus,
      });
      const response = await fetch(`/api/admin/demand-agencies?${params}`, { cache: "no-store" });
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      const responseData = await response.json() as AgencyResponse;
      if (!response.ok) throw new Error(responseData.detail ?? "수요기관 조회 오류");
      setData(responseData);
      setAuthenticated(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수요기관 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [agencyStatus, detailType, jurisdictionType, page, query]);

  useEffect(() => {
    void loadAgencies();
  }, [loadAgencies]);

  useEffect(() => {
    if (!data.sync.running) return undefined;
    const timer = window.setInterval(() => void loadAgencies(), 3000);
    return () => window.clearInterval(timer);
  }, [data.sync.running, loadAgencies]);

  useEffect(() => {
    if (syncMessageRunId === null) return;
    const run = data.sync.history.find((item) => item.id === syncMessageRunId);
    if (run && run.status !== "running") {
      setMessage("");
      setSyncMessageRunId(null);
    }
  }, [data.sync.history, syncMessageRunId]);

  const pageNumbers = useMemo(() => {
    const totalPages = data.pagination.totalPages;
    const firstPage = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, index) => firstPage + index);
  }, [data.pagination.totalPages, page]);

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setQuery(queryInput.trim());
  };

  const startSync = async () => {
    if (!window.confirm("최근 7일의 수요기관 등록·변경 정보를 다시 가져오시겠습니까?")) return;
    setSyncStarting(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/demand-agencies/sync?force=true", { method: "POST" });
      const responseData = await response.json() as { message?: string; detail?: string; run?: SyncRun };
      if (!response.ok) throw new Error(responseData.detail ?? "수요기관 정보 가져오기 오류");
      setSyncMessageRunId(responseData.run?.id ?? null);
      setMessage(responseData.message ?? "수요기관 정보 가져오기를 시작했습니다.");
      await loadAgencies();
    } catch (error) {
      setSyncMessageRunId(null);
      setMessage(error instanceof Error ? error.message : "수요기관 정보 가져오기를 시작하지 못했습니다.");
    } finally {
      setSyncStarting(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setData(EMPTY_RESPONSE);
  };

  if (authenticated === null) {
    return (
      <main className="admin-shell">
        <section className="admin-auth-loading" role="status" aria-live="polite">
          <span className="admin-auth-spinner" aria-hidden="true" />
          <p>관리자 인증을 확인하고 있습니다.</p>
        </section>
      </main>
    );
  }

  if (authenticated === false) {
    return (
      <main className="admin-shell">
        <section className="admin-login-card" aria-labelledby="agency-login-title">
          <a className="admin-brand" href="/" aria-label="FindBid 검색으로 이동"><span>FB</span><strong>FindBid</strong></a>
          <span className="admin-kicker">DEMAND AGENCY MANAGEMENT</span>
          <h1 id="agency-login-title">관리자 로그인이 필요합니다</h1>
          <p>운영 관리 페이지에서 로그인한 후 수요기관 정보를 관리할 수 있습니다.</p>
          <a className="admin-login-link" href="/admin">관리자 로그인으로 이동</a>
        </section>
      </main>
    );
  }

  const latestSuccess = data.sync.latestSuccess;
  const forceSyncDisabled = syncStarting || Boolean(data.sync.running);

  return (
    <main className="admin-shell admin-dashboard-shell">
      <header className="admin-topbar">
        <a className="admin-brand" href="/"><span>FB</span><strong>FindBid</strong></a>
        <nav className="admin-tabs" aria-label="관리자 메뉴">
          <a href="/admin">운영 관리</a>
          <a href="/admin/activity-logs">DB 활동로그</a>
          <a className="active" href="/admin/demand-agencies" aria-current="page">수요기관 관리</a>
        </nav>
        <div>
          <button type="button" onClick={() => void loadAgencies()} disabled={loading}>
            {loading ? "갱신 중..." : "목록 새로고침"}
          </button>
          <button type="button" className="admin-logout" onClick={() => void logout()}>로그아웃</button>
        </div>
      </header>

      <section className="admin-dashboard admin-agency-dashboard" aria-labelledby="agency-page-title">
        <div className="admin-dashboard-head">
          <div>
            <span className="admin-kicker">G2B DEMAND AGENCY DATABASE</span>
            <h1 id="agency-page-title">나라장터 수요기관 관리</h1>
            <p>나라장터 사용자정보 서비스에서 하루 한 번 최신 기관 변경정보를 가져옵니다.</p>
          </div>
          <div className="admin-agency-sync-actions">
            <button type="button" className="admin-agency-import-button" disabled={forceSyncDisabled} onClick={() => void startSync()}>
              {data.sync.running ? "정보 가져오는 중..." : syncStarting ? "시작 중..." : "수요기관 정보 가져오기"}
            </button>
          </div>
        </div>

        {message && <div className={`admin-message ${message.includes("못") || message.includes("오류") || message.includes("실패") ? "error" : "success"}`} role="status">{message}</div>}

        <div className="admin-agency-metrics">
          <article><span>전체 기관</span><strong>{data.summary.total.toLocaleString("ko-KR")}<em>개</em></strong></article>
          <article><span>활성 기관</span><strong>{data.summary.active.toLocaleString("ko-KR")}<em>개</em></strong></article>
          <article><span>삭제 기관</span><strong>{data.summary.deleted.toLocaleString("ko-KR")}<em>개</em></strong></article>
          <article><span>마지막 동기화</span><strong className="date">{displayDate(latestSuccess?.finishedAt ?? null)}</strong></article>
        </div>

        {data.sync.running && (
          <div className="admin-agency-sync-progress" role="status">
            <span className="admin-auth-spinner" aria-hidden="true" />
            <div><strong>수요기관 정보를 가져오고 있습니다.</strong><small>조회 범위와 처리 결과는 완료 후 자동으로 갱신됩니다.</small></div>
          </div>
        )}

        {latestSuccess && !data.sync.running && (
          <div className="admin-agency-latest-sync">
            <span>{completedToday(latestSuccess) ? "오늘 동기화 완료" : "최근 완료"}</span>
            <strong>{triggerLabel(latestSuccess.trigger)}</strong>
            <p>{inquiryDate(latestSuccess.inquiryStart)} ~ {inquiryDate(latestSuccess.inquiryEnd)}</p>
            <small>수신 {latestSuccess.receivedCount.toLocaleString("ko-KR")}건 · 신규 {latestSuccess.createdCount.toLocaleString("ko-KR")}건 · 변경 {latestSuccess.updatedCount.toLocaleString("ko-KR")}건 · 삭제 {latestSuccess.deletedCount.toLocaleString("ko-KR")}건</small>
          </div>
        )}

        <section className="admin-agency-list-card" aria-labelledby="agency-list-title">
          <div className="admin-agency-list-head">
            <div><h2 id="agency-list-title">수요기관 정보</h2><p>검색 결과 {data.pagination.total.toLocaleString("ko-KR")}개</p></div>
            <form onSubmit={applySearch} className="admin-agency-search">
              <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="기관명·기관코드·최상위기관 검색" aria-label="수요기관 검색어" />
              <button type="submit">검색</button>
            </form>
          </div>

          <div className="admin-agency-filters">
            <label>기관종류<select value={jurisdictionType} onChange={(event) => { setJurisdictionType(event.target.value); setPage(1); }}><option value="">전체 기관종류</option>{data.filters.jurisdictionTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>기관세부유형<select value={detailType} onChange={(event) => { setDetailType(event.target.value); setPage(1); }}><option value="">전체 세부유형</option>{data.filters.detailTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>기관상태<select value={agencyStatus} onChange={(event) => { setAgencyStatus(event.target.value); setPage(1); }}><option value="active">활성 기관</option><option value="deleted">삭제 기관</option><option value="all">전체 상태</option></select></label>
          </div>

          <div className="admin-agency-table-wrap">
            <table className="admin-agency-table">
              <thead><tr><th>순번</th><th>기관코드</th><th>기관명</th><th>기관종류</th><th>기관세부유형</th><th>최상위기관</th><th>지역</th><th>상태</th><th>원본 변경일</th></tr></thead>
              <tbody>{data.items.length === 0 ? (
                <tr><td colSpan={9}>{loading ? "수요기관 정보를 조회하고 있습니다." : "조건에 맞는 수요기관이 없습니다."}</td></tr>
              ) : data.items.map((agency, index) => (
                <tr key={agency.code}>
                  <td>{data.pagination.total - ((data.pagination.page - 1) * data.pagination.pageSize) - index}</td>
                  <td>{agency.code}</td>
                  <td><strong>{agency.name}</strong>{agency.abbreviation && <small>{agency.abbreviation}</small>}</td>
                  <td>{agency.jurisdictionType || "미분류"}</td>
                  <td><strong>{agency.detailTypeLarge || "미분류"}</strong><small>{[agency.detailTypeMiddle, agency.detailTypeSmall].filter(Boolean).join(" · ")}</small></td>
                  <td>{agency.topLevelAgencyName || "미등록"}</td>
                  <td>{agency.regionName || "미등록"}</td>
                  <td><span className={`admin-agency-status ${agency.deleted ? "deleted" : "active"}`}>{agency.deleted ? "삭제" : "활성"}</span></td>
                  <td>{agency.sourceChangedAt || agency.sourceRegisteredAt || "없음"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          {data.pagination.total > 0 && (
            <nav className="admin-activity-pagination" aria-label="수요기관 페이지 이동">
              <button type="button" disabled={loading || page === 1} onClick={() => setPage(1)}>페이지 시작</button>
              <button type="button" disabled={loading || page === 1} onClick={() => setPage(Math.max(1, page - PAGE_JUMP))}>이전 5페이지</button>
              {pageNumbers.map((pageNumber) => <button type="button" key={pageNumber} className={pageNumber === page ? "active" : ""} aria-current={pageNumber === page ? "page" : undefined} disabled={loading} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}
              <button type="button" disabled={loading || page === data.pagination.totalPages} onClick={() => setPage(Math.min(data.pagination.totalPages, page + PAGE_JUMP))}>다음 5페이지</button>
              <button type="button" disabled={loading || page === data.pagination.totalPages} onClick={() => setPage(data.pagination.totalPages)}>페이지 끝</button>
            </nav>
          )}
        </section>

        <section className="admin-agency-history" aria-labelledby="agency-history-title">
          <h2 id="agency-history-title">동기화 실행 이력</h2>
          <div className="admin-agency-history-table-wrap"><table><thead><tr><th>실행일시</th><th>실행구분</th><th>상태</th><th>조회범위</th><th>수신</th><th>신규</th><th>변경</th><th>삭제</th><th>오류</th></tr></thead><tbody>
            {data.sync.history.length === 0 ? <tr><td colSpan={9}>동기화 실행 이력이 없습니다.</td></tr> : data.sync.history.map((run) => <tr key={run.id}><td>{displayDate(run.startedAt)}</td><td>{triggerLabel(run.trigger)}</td><td><span className={`admin-sync-status ${run.status}`}>{statusLabel(run.status)}</span></td><td>{inquiryDate(run.inquiryStart)} ~ {inquiryDate(run.inquiryEnd)}</td><td>{run.receivedCount.toLocaleString("ko-KR")}</td><td>{run.createdCount.toLocaleString("ko-KR")}</td><td>{run.updatedCount.toLocaleString("ko-KR")}</td><td>{run.deletedCount.toLocaleString("ko-KR")}</td><td title={run.errorMessage}>{run.errorMessage || "-"}</td></tr>)}
          </tbody></table></div>
        </section>
      </section>
    </main>
  );
}
