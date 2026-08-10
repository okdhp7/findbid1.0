"use client";

import { useCallback, useEffect, useState } from "react";

type ActivityUser = {
  sessionHash: string;
  sessionLabel: string;
  ipHash: string;
  userAgent: string;
  companyProfile: Record<string, unknown>;
  aiSearchCount: number;
  feedbackCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

type SearchActivity = {
  id: number;
  searchId: string;
  sessionLabel: string;
  trigger: string;
  request: Record<string, unknown>;
  resultSummary: Record<string, unknown>;
  createdAt: string;
};

type FeedbackActivity = {
  id: number;
  searchId: string;
  sessionLabel: string;
  bidId: string;
  feedbackType: string;
  reasons: string[];
  source: string;
  createdAt: string;
};

type ActivityPagination = {
  type: ActivityView;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ActivityLogsResponse = {
  summary: { users: number; searches: number; feedback: number };
  pagination: ActivityPagination;
  users: ActivityUser[];
  searches: SearchActivity[];
  feedback: FeedbackActivity[];
};

type ActivityView = "users" | "searches" | "feedback";
type ActivityDetailModal =
  | { kind: "user"; user: ActivityUser }
  | { kind: "search-request"; search: SearchActivity }
  | { kind: "search-result"; search: SearchActivity };

const ACTIVITY_PAGE_SIZE = 15;
const INITIAL_PAGES: Record<ActivityView, number> = { users: 1, searches: 1, feedback: 1 };
const INITIAL_PAGINATION: Record<ActivityView, ActivityPagination> = {
  users: { type: "users", page: 1, pageSize: ACTIVITY_PAGE_SIZE, total: 0, totalPages: 1 },
  searches: { type: "searches", page: 1, pageSize: ACTIVITY_PAGE_SIZE, total: 0, totalPages: 1 },
  feedback: { type: "feedback", page: 1, pageSize: ACTIVITY_PAGE_SIZE, total: 0, totalPages: 1 },
};

const activityDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

function activityDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : activityDateFormatter.format(date);
}

function activityValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "미입력";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "없음";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  if (typeof value === "boolean") return value ? "예" : "아니요";
  return String(value);
}

function activityList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function activityNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function activityMoney(value: unknown) {
  const number = activityNumber(value);
  return number > 0 ? `${number.toLocaleString("ko-KR")}원` : "전체 금액";
}

function searchResultCount(resultSummary: Record<string, unknown>) {
  const total = activityNumber(resultSummary.total);
  if (total > 0) return total;
  return Array.isArray(resultSummary.items) ? resultSummary.items.length : 0;
}

type SearchConditionPreview = {
  input: string[];
  selected: string[];
};

function searchConditionPreview(request: Record<string, unknown>): SearchConditionPreview {
  const input: string[] = [];
  const selected: string[] = [];
  const semanticQuery = String(request.semanticQuery ?? "").trim();
  const category = String(request.category ?? "").trim();
  const region = String(request.region ?? "").trim();
  const maxBudget = activityNumber(request.maxBudget);
  const closingWithinDays = activityNumber(request.closingWithinDays);

  if (semanticQuery) input.push(semanticQuery);
  input.push(...activityList(request.includeKeywords));
  input.push(...activityList(request.excludeKeywords));
  input.push(...activityList(request.demandAgencies));

  if (category && category !== "전체") selected.push(category);
  if (region && !["전체 지역", "전체지역"].includes(region)) selected.push(region);
  if (maxBudget > 0) selected.push(`${activityMoney(maxBudget)} 이하`);
  if (closingWithinDays > 0) selected.push(`${closingWithinDays}일 이내`);
  if (request.onlyEligible) selected.push("참가 가능만");
  else if (request.eligibilityMode === "not_eligible") selected.push("참가 어려움만");
  if (request.sortMode === "opportunity") selected.push("기회순");
  else if (request.sortMode === "latest") selected.push("최신순");

  return { input, selected };
}

function searchTriggerLabel(value: string) {
  if (value === "ai_button") return "AI로 검색";
  if (value === "feedback_promoted") return "피드백 기반 저장";
  return value;
}

export default function AdminActivityLogsPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [summary, setSummary] = useState({ users: 0, searches: 0, feedback: 0 });
  const [users, setUsers] = useState<ActivityUser[]>([]);
  const [searches, setSearches] = useState<SearchActivity[]>([]);
  const [feedback, setFeedback] = useState<FeedbackActivity[]>([]);
  const [pages, setPages] = useState<Record<ActivityView, number>>(INITIAL_PAGES);
  const [pagination, setPagination] = useState<Record<ActivityView, ActivityPagination>>(INITIAL_PAGINATION);
  const [activeView, setActiveView] = useState<ActivityView>("users");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [detailModal, setDetailModal] = useState<ActivityDetailModal | null>(null);

  const loadActivityLogs = useCallback(async (view: ActivityView, page: number) => {
    setLoading(true);
    setMessage("");
    try {
      const query = new URLSearchParams({
        type: view,
        page: String(page),
        pageSize: String(ACTIVITY_PAGE_SIZE),
      });
      const response = await fetch(`/api/admin/activity-logs?${query}`, { cache: "no-store" });
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      const data = await response.json() as ActivityLogsResponse & { detail?: string };
      if (!response.ok) throw new Error(data.detail ?? "DB 활동로그 조회 오류");
      setSummary(data.summary);
      setPagination((current) => ({ ...current, [view]: data.pagination }));
      setPages((current) => ({ ...current, [view]: data.pagination.page }));
      if (view === "users") setUsers(data.users);
      if (view === "searches") setSearches(data.searches);
      if (view === "feedback") setFeedback(data.feedback);
      setAuthenticated(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "DB 활동로그를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActivityLogs("users", 1);
  }, [loadActivityLogs]);

  useEffect(() => {
    if (!detailModal) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailModal(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [detailModal]);

  const selectActivityView = (view: ActivityView) => {
    setActiveView(view);
    void loadActivityLogs(view, pages[view]);
  };

  const activitySequence = (view: ActivityView, index: number) => {
    const meta = pagination[view];
    return meta.total - ((meta.page - 1) * meta.pageSize) - index;
  };

  const renderPagination = (view: ActivityView) => {
    const meta = pagination[view];
    if (meta.total === 0) return null;
    const firstPage = Math.max(1, Math.min(meta.page - 2, meta.totalPages - 4));
    const pageNumbers = Array.from(
      { length: Math.min(5, meta.totalPages) },
      (_, index) => firstPage + index,
    );
    return (
      <nav className="admin-activity-pagination" aria-label={`${view} 페이지 이동`}>
        <button type="button" disabled={loading || meta.page === 1} onClick={() => void loadActivityLogs(view, meta.page - 1)}>이전</button>
        {pageNumbers.map((pageNumber) => (
          <button
            type="button"
            key={pageNumber}
            className={pageNumber === meta.page ? "active" : ""}
            aria-current={pageNumber === meta.page ? "page" : undefined}
            disabled={loading}
            onClick={() => void loadActivityLogs(view, pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button type="button" disabled={loading || meta.page === meta.totalPages} onClick={() => void loadActivityLogs(view, meta.page + 1)}>다음</button>
      </nav>
    );
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin";
  };

  const deleteActivityUser = async (user: ActivityUser) => {
    if (!window.confirm(`${user.sessionLabel} 사용자의 프로필·검색·피드백 기록을 모두 삭제하시겠습니까?`)) {
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/activity-users/${encodeURIComponent(user.sessionHash)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("사용자 활동기록 삭제 오류");
      const remainingTotal = Math.max(0, pagination.users.total - 1);
      const lastPage = Math.max(1, Math.ceil(remainingTotal / ACTIVITY_PAGE_SIZE));
      const targetPage = Math.min(pages.users, lastPage);
      setPages((current) => ({ ...current, searches: 1, feedback: 1 }));
      await loadActivityLogs("users", targetPage);
      setDetailModal(null);
      setMessage("사용자 활동기록을 삭제했습니다.");
    } catch {
      setMessage("사용자 활동기록을 삭제하지 못했습니다.");
    } finally {
      setLoading(false);
    }
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
        <section className="admin-login-card" aria-labelledby="activity-login-title">
          <a className="admin-brand" href="/" aria-label="FindBid 검색으로 이동">
            <span>FB</span><strong>FindBid</strong>
          </a>
          <span className="admin-kicker">DATABASE ACTIVITY LOG</span>
          <h1 id="activity-login-title">관리자 로그인이 필요합니다</h1>
          <p>운영 관리 페이지에서 로그인한 후 DB 활동로그를 조회할 수 있습니다.</p>
          <a className="admin-login-link" href="/admin">관리자 로그인으로 이동</a>
        </section>
      </main>
    );
  }

  const modalProfile = detailModal?.kind === "user"
    ? detailModal.user.companyProfile
    : {};
  const modalRequest = detailModal?.kind === "search-request"
    ? detailModal.search.request
    : {};
  const modalResult = detailModal?.kind === "search-result"
    ? detailModal.search.resultSummary
    : {};
  const modalResultItems = Array.isArray(modalResult.items)
    ? modalResult.items.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
    )
    : [];

  return (
    <main className="admin-shell admin-dashboard-shell">
      <header className="admin-topbar">
        <a className="admin-brand" href="/"><span>FB</span><strong>FindBid</strong></a>
        <nav className="admin-tabs" aria-label="관리자 메뉴">
          <a href="/admin">운영 관리</a>
          <a className="active" href="/admin/activity-logs" aria-current="page">DB 활동로그</a>
        </nav>
        <div>
          <button
            type="button"
            onClick={() => void loadActivityLogs(activeView, pages[activeView])}
            disabled={loading}
            aria-label="DB 활동로그 새로고침"
          >
            {loading ? "갱신 중..." : "로그 새로고침"}
          </button>
          <button type="button" className="admin-logout" onClick={() => void logout()}>로그아웃</button>
        </div>
      </header>

      <section className="admin-dashboard" aria-labelledby="activity-log-title">
        <div className="admin-dashboard-head">
          <div>
            <span className="admin-kicker">DATABASE ACTIVITY LOG</span>
            <h1 id="activity-log-title">사용자·AI 검색·피드백 기록</h1>
            <p>기업프로필 저장, AI로 검색 실행, 추천결과 피드백을 PostgreSQL에서 조회합니다.</p>
          </div>
          <span className="admin-health ok">DB 저장 로그</span>
        </div>

        {message && <div className="admin-message success" role="status">{message}</div>}

        <div className="admin-activity-metrics">
          <article><span>사용자</span><strong>{summary.users.toLocaleString("ko-KR")}명</strong></article>
          <article><span>저장 검색</span><strong>{summary.searches.toLocaleString("ko-KR")}건</strong></article>
          <article><span>저장 피드백</span><strong>{summary.feedback.toLocaleString("ko-KR")}건</strong></article>
        </div>

        <nav className="admin-activity-subtabs" aria-label="DB 활동로그 구분">
          <button type="button" className={activeView === "users" ? "active" : ""} onClick={() => selectActivityView("users")}>사용자·기업프로필</button>
          <button type="button" className={activeView === "searches" ? "active" : ""} onClick={() => selectActivityView("searches")}>AI 검색 이력</button>
          <button type="button" className={activeView === "feedback" ? "active" : ""} onClick={() => selectActivityView("feedback")}>추천 피드백</button>
        </nav>

        {activeView === "users" && (
          <div className="admin-activity-list">
            <div className="admin-activity-table-wrap">
              <table className="admin-activity-table">
              <thead><tr><th>순번</th><th>최근 활동</th><th>사용자</th><th>기업명</th><th>AI 검색</th><th>피드백</th><th>조회·관리</th></tr></thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={7}>{loading ? "활동기록을 조회하고 있습니다." : "저장된 사용자 활동기록이 없습니다."}</td></tr>
                ) : users.map((user, index) => (
                  <tr key={user.sessionHash}>
                    <td>{activitySequence("users", index)}</td>
                    <td>{activityDate(user.lastSeenAt)}</td><td>{user.sessionLabel}</td>
                    <td>{String(user.companyProfile.name ?? "미입력")}</td>
                    <td>{user.aiSearchCount.toLocaleString("ko-KR")}건</td>
                    <td>{user.feedbackCount.toLocaleString("ko-KR")}건</td>
                    <td><button type="button" className="admin-activity-view-button" onClick={() => setDetailModal({ kind: "user", user })}>조회관리</button></td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            {renderPagination("users")}
          </div>
        )}

        {activeView === "searches" && (
          <div className="admin-activity-list">
            <div className="admin-activity-table-wrap"><table className="admin-activity-table">
            <thead><tr><th>순번</th><th>검색일시</th><th>사용자</th><th>저장 구분</th><th>검색조건</th><th>검색결과</th></tr></thead>
            <tbody>{searches.length === 0 ? (
              <tr><td colSpan={6}>{loading ? "검색기록을 조회하고 있습니다." : "저장된 AI 검색기록이 없습니다."}</td></tr>
            ) : searches.map((search, index) => {
              const conditionPreview = searchConditionPreview(search.request);
              const conditionValues = [...conditionPreview.input, ...conditionPreview.selected];
              return (
                <tr key={search.id}><td>{activitySequence("searches", index)}</td><td>{activityDate(search.createdAt)}</td><td>{search.sessionLabel}</td><td>{search.trigger}</td>
                  <td>
                    {conditionValues.length > 0 ? (
                      <button
                        type="button"
                        className="admin-activity-condition-values"
                        title={conditionValues.join(" · ")}
                        onClick={() => setDetailModal({ kind: "search-request", search })}
                      >
                        {conditionValues.join(" · ")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="admin-activity-condition-values empty"
                        onClick={() => setDetailModal({ kind: "search-request", search })}
                      >
                        전체 조건
                      </button>
                    )}
                  </td>
                  <td><button type="button" className="admin-activity-view-button" onClick={() => setDetailModal({ kind: "search-result", search })}>공고 요약 {searchResultCount(search.resultSummary).toLocaleString("ko-KR")}건</button></td>
                </tr>
              );
            })}</tbody>
            </table></div>
            {renderPagination("searches")}
          </div>
        )}

        {activeView === "feedback" && (
          <div className="admin-activity-list">
            <div className="admin-activity-table-wrap"><table className="admin-activity-table">
            <thead><tr><th>순번</th><th>피드백일시</th><th>사용자</th><th>구분</th><th>공고</th><th>사유</th></tr></thead>
            <tbody>{feedback.length === 0 ? (
              <tr><td colSpan={6}>{loading ? "피드백을 조회하고 있습니다." : "저장된 추천 피드백이 없습니다."}</td></tr>
            ) : feedback.map((feedbackItem, index) => (
              <tr key={feedbackItem.id}><td>{activitySequence("feedback", index)}</td><td>{activityDate(feedbackItem.createdAt)}</td><td>{feedbackItem.sessionLabel}</td>
                <td>{feedbackItem.feedbackType}</td><td>{feedbackItem.bidId}</td><td>{feedbackItem.reasons.join(", ") || "사유 없음"}</td></tr>
            ))}</tbody>
            </table></div>
            {renderPagination("feedback")}
          </div>
        )}
      </section>

      {detailModal && (
        <div
          className="admin-activity-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailModal(null);
          }}
        >
          <section
            className="admin-activity-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-activity-modal-title"
          >
            <header>
              <div>
                <span className="admin-kicker">DATABASE ACTIVITY DETAIL</span>
                <h2 id="admin-activity-modal-title">
                  {detailModal.kind === "user"
                    ? "사용자·기업프로필 조회관리"
                    : detailModal.kind === "search-request"
                      ? "AI 검색조건"
                      : "AI 검색결과 요약"}
                </h2>
              </div>
              <button type="button" className="admin-activity-modal-close" aria-label="팝업 닫기" onClick={() => setDetailModal(null)} autoFocus>×</button>
            </header>

            <div className="admin-activity-modal-content">
              {detailModal.kind === "user" ? (
                <>
                  <div className="admin-activity-modal-identity">
                    <span>{String(modalProfile.name || "미").slice(0, 1)}</span>
                    <div><strong>{String(modalProfile.name || "기업명 미입력")}</strong><small>{detailModal.user.sessionLabel} · 최근 활동 {activityDate(detailModal.user.lastSeenAt)}</small></div>
                  </div>
                  <div className="admin-activity-modal-metrics three">
                    <article><span>프로필 완성도</span><strong>{activityNumber(modalProfile.completion)}<em>%</em></strong></article>
                    <article><span>AI 검색</span><strong>{detailModal.user.aiSearchCount.toLocaleString("ko-KR")}<em>건</em></strong></article>
                    <article><span>추천 피드백</span><strong>{detailModal.user.feedbackCount.toLocaleString("ko-KR")}<em>건</em></strong></article>
                  </div>

                  <section className="admin-activity-modal-section">
                    <h3>기업 기본정보</h3>
                    <dl className="admin-activity-modal-fields">
                      <div><dt>소재지</dt><dd>{activityValue(modalProfile.location)}</dd></div>
                      <div><dt>기업규모</dt><dd>{activityValue(modalProfile.size)}</dd></div>
                      <div><dt>희망 최대 사업금액</dt><dd>{activityMoney(modalProfile.preferredMaxBudget)}</dd></div>
                      <div><dt>최초 활동</dt><dd>{activityDate(detailModal.user.firstSeenAt)}</dd></div>
                    </dl>
                  </section>

                  {[
                    ["보유 면허·자격", activityList(modalProfile.licenses)],
                    ["보유 기술", activityList(modalProfile.technologies)],
                    ["주요 사업분야", activityList(modalProfile.businessAreas)],
                    ["수행 경험", activityList(modalProfile.experiences)],
                    ["수행 가능 지역", activityList(modalProfile.serviceRegions)],
                    ["수행 가능 기관유형", activityList(modalProfile.serviceAgencyTypes)],
                    ["제외 사업분야", activityList(modalProfile.excludedBusinessAreas)],
                  ].map(([label, values]) => (
                    <section className="admin-activity-tag-section" key={String(label)}>
                      <h3>{String(label)}</h3>
                      <div className="admin-activity-tags">
                        {(values as string[]).length > 0
                          ? (values as string[]).map((value) => <span key={value}>{value}</span>)
                          : <small>등록된 정보가 없습니다.</small>}
                      </div>
                    </section>
                  ))}

                  <details className="admin-activity-modal-raw connection">
                    <summary>접속정보 보기</summary>
                    <dl className="admin-activity-modal-fields">
                      <div><dt>IP 해시</dt><dd>{detailModal.user.ipHash || "없음"}</dd></div>
                      <div className="wide"><dt>브라우저</dt><dd>{detailModal.user.userAgent || "없음"}</dd></div>
                    </dl>
                  </details>
                </>
              ) : detailModal.kind === "search-request" ? (
                <>
                  <div className="admin-activity-search-heading">
                    <span>검색조건 상세</span>
                    <strong>입력 조건과 선택 조건</strong>
                    <small>{detailModal.search.sessionLabel} · {activityDate(detailModal.search.createdAt)} · {searchTriggerLabel(detailModal.search.trigger)}</small>
                  </div>
                  <div className="admin-activity-condition-groups">
                    <section className="admin-activity-condition-group selected">
                      <div className="admin-activity-condition-group-head">
                        <span>항목 선택</span>
                        <div><h3>선택한 상세조건</h3><p>버튼과 선택 목록에서 지정한 검색 범위입니다.</p></div>
                      </div>
                      <dl className="admin-activity-selected-conditions">
                        <div><dt>업무구분</dt><dd>{String(modalRequest.category || "전체")}</dd></div>
                        <div><dt>수행지역</dt><dd>{String(modalRequest.region || "전체 지역")}</dd></div>
                        <div><dt>최대 사업금액</dt><dd>{activityMoney(modalRequest.maxBudget)}</dd></div>
                        <div><dt>마감기간</dt><dd>{activityNumber(modalRequest.closingWithinDays) > 0 ? `${activityNumber(modalRequest.closingWithinDays)}일 이내` : "전체"}</dd></div>
                        <div><dt>참가 가능 여부</dt><dd>{modalRequest.onlyEligible ? "참가 가능만" : modalRequest.eligibilityMode === "not_eligible" ? "참가 어려움만" : "전체"}</dd></div>
                        <div><dt>정렬방식</dt><dd>{modalRequest.sortMode === "opportunity" ? "기회순" : modalRequest.sortMode === "latest" ? "최신순" : "기본 정렬"}</dd></div>
                      </dl>
                    </section>

                    <section className="admin-activity-condition-group input">
                      <div className="admin-activity-condition-group-head">
                        <span>직접 입력</span>
                        <div><h3>입력한 검색조건</h3><p>사용자가 검색창과 입력창에 직접 작성한 내용입니다.</p></div>
                      </div>
                      <div className="admin-activity-input-condition query">
                        <strong>AI 검색어</strong>
                        <p>{String(modalRequest.semanticQuery || "입력값 없음")}</p>
                      </div>
                      {[
                        ["포함키워드", activityList(modalRequest.includeKeywords), "include"],
                        ["제외키워드", activityList(modalRequest.excludeKeywords), "exclude"],
                        ["수요기관명", activityList(modalRequest.demandAgencies), "agency"],
                      ].map(([label, values, tone]) => (
                        <div className="admin-activity-input-condition" key={String(label)}>
                          <strong>{String(label)}</strong>
                          <div className={`admin-activity-tags ${tone}`}>
                            {(values as string[]).length > 0
                              ? (values as string[]).map((value) => <span key={value}>{value}</span>)
                              : <small>입력값 없음</small>}
                          </div>
                        </div>
                      ))}
                    </section>

                  </div>
                  <details className="admin-activity-modal-raw">
                    <summary>개발정보 보기</summary>
                    <pre>{JSON.stringify(modalRequest, null, 2)}</pre>
                  </details>
                </>
              ) : (
                <>
                  <div className="admin-activity-search-heading result">
                    <span>검색결과</span>
                    <strong>{detailModal.search.sessionLabel} 사용자의 AI 검색</strong>
                    <small>{activityDate(detailModal.search.createdAt)} · {searchTriggerLabel(detailModal.search.trigger)}</small>
                  </div>
                  <div className="admin-activity-modal-metrics four result">
                    <article><span>검색 결과</span><strong>{activityNumber(modalResult.total).toLocaleString("ko-KR")}<em>건</em></strong></article>
                    <article><span>참가 가능</span><strong>{activityNumber(modalResult.eligibleTotal).toLocaleString("ko-KR")}<em>건</em></strong></article>
                    <article><span>마감 임박</span><strong>{activityNumber(modalResult.closingSoonTotal).toLocaleString("ko-KR")}<em>건</em></strong></article>
                    <article><span>평균 적합도</span><strong>{activityNumber(modalResult.averageScore).toLocaleString("ko-KR")}<em>점</em></strong></article>
                  </div>
                  <div className="admin-activity-result-meta">
                    <span>전체 DB <strong>{activityNumber(modalResult.databaseTotal).toLocaleString("ko-KR")}건</strong></span>
                    <span>검색 처리시간 <strong>{activityNumber(modalResult.elapsedMs).toLocaleString("ko-KR")}ms</strong></span>
                    <span>저장 공고 <strong>{modalResultItems.length.toLocaleString("ko-KR")}건</strong></span>
                  </div>
                  <section className="admin-activity-modal-section result-items">
                    <h3>추천 공고 요약</h3>
                    {modalResultItems.length > 0 ? (
                      <div className="admin-activity-result-table-wrap">
                        <table className="admin-activity-result-table">
                          <thead><tr><th>공고명</th><th>수요기관</th><th>적합도</th><th>참가판정</th></tr></thead>
                          <tbody>{modalResultItems.map((item, index) => (
                            <tr key={String(item.bidId || item.noticeNo || index)}>
                              <td><strong>{String(item.title || "공고명 없음")}</strong><small>{String(item.noticeNo || "")}</small></td>
                              <td>{String(item.demandAgency || "미입력")}</td>
                              <td><span className="admin-activity-score">{activityNumber(item.score)}점</span></td>
                              <td><span className={`admin-activity-eligibility ${item.eligibility === "참가 가능" ? "eligible" : ""}`}>{String(item.eligibility || "확인 필요")}</span></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    ) : <p className="admin-activity-empty">저장된 추천 공고 요약이 없습니다.</p>}
                  </section>
                  <details className="admin-activity-modal-raw">
                    <summary>개발정보 보기</summary>
                    <pre>{JSON.stringify(modalResult, null, 2)}</pre>
                  </details>
                </>
              )}
            </div>
            <footer className="admin-activity-modal-footer">
              {detailModal.kind === "user" && <button type="button" className="admin-activity-modal-delete" disabled={loading} onClick={() => void deleteActivityUser(detailModal.user)}>사용자 기록 삭제</button>}
              <button type="button" className="admin-activity-modal-done" onClick={() => setDetailModal(null)}>닫기</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
