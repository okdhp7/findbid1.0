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
                    <td><details><summary>상세</summary><div className="admin-activity-detail">
                      <p>IP 해시: {user.ipHash || "없음"}</p><p>브라우저: {user.userAgent || "없음"}</p>
                      <pre>{JSON.stringify(user.companyProfile, null, 2)}</pre>
                      <button type="button" className="delete" onClick={() => void deleteActivityUser(user)}>기록 삭제</button>
                    </div></details></td>
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
            <thead><tr><th>순번</th><th>검색일시</th><th>사용자</th><th>저장 구분</th><th>검색조건</th><th>결과 요약</th></tr></thead>
            <tbody>{searches.length === 0 ? (
              <tr><td colSpan={6}>{loading ? "검색기록을 조회하고 있습니다." : "저장된 AI 검색기록이 없습니다."}</td></tr>
            ) : searches.map((search, index) => (
              <tr key={search.id}><td>{activitySequence("searches", index)}</td><td>{activityDate(search.createdAt)}</td><td>{search.sessionLabel}</td><td>{search.trigger}</td>
                <td><details><summary>{String(search.request.semanticQuery || "상세조건 검색")}</summary><pre>{JSON.stringify(search.request, null, 2)}</pre></details></td>
                <td><details><summary>{Number(search.resultSummary.total ?? 0).toLocaleString("ko-KR")}건</summary><pre>{JSON.stringify(search.resultSummary, null, 2)}</pre></details></td>
              </tr>
            ))}</tbody>
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
    </main>
  );
}
