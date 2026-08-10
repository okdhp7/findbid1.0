"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type AdminStatus = {
  feedbackEnabled: boolean;
  redis: {
    status: string;
    activeSessions: number;
    ttlSeconds: number;
  };
  feedbackSummary: {
    positive: number;
    negative: number;
    exclude: number;
    total: number;
  };
  feedbackReasons: Record<string, number>;
  versions: Record<string, string | number>;
};

type NotificationPost = {
  id: number;
  publisher: string;
  content: string;
  publishedAt: string;
};

const notificationDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

function notificationPublishedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : notificationDateFormatter.format(date);
}

const versionLabels: Record<string, string> = {
  searchPipeline: "검색 파이프라인",
  fingerprintSchema: "검색 지문",
  normalizer: "문장 정규화",
  intentParser: "의도·조건 파서",
  rankingModel: "추천 모델",
  feedbackPolicy: "피드백 정책",
};

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [settingSaving, setSettingSaving] = useState(false);
  const [notifications, setNotifications] = useState<NotificationPost[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationPublisher, setNotificationPublisher] = useState("관리자");
  const [notificationContent, setNotificationContent] = useState("");
  const [editingNotificationId, setEditingNotificationId] = useState<number | null>(null);
  const loadNotifications = useCallback(async () => {
    setNotificationLoading(true);
    try {
      const response = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (response.status === 401) {
        setAuthenticated(false);
        setNotifications([]);
        return;
      }
      const data = await response.json() as {
        items?: NotificationPost[];
        detail?: string;
      };
      if (!response.ok) throw new Error(data.detail ?? "알림 조회 오류");
      setNotifications(data.items ?? []);
    } catch {
      setMessage("알림 게시물 목록을 불러오지 못했습니다.");
    } finally {
      setNotificationLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/status", { cache: "no-store" });
      if (response.status === 401) {
        setAuthenticated(false);
        setStatus(null);
        return;
      }
      if (!response.ok) throw new Error("상태 조회 오류");
      setStatus(await response.json() as AdminStatus);
      setAuthenticated(true);
      setMessage("");
    } catch {
      setMessage("추천 운영 상태를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadNotifications();
  }, [loadNotifications, loadStatus]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json() as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "관리자 비밀번호가 올바르지 않습니다.");
        return;
      }
      setPassword("");
      setAuthenticated(true);
      await Promise.all([loadStatus(), loadNotifications()]);
    } catch {
      setMessage("관리자 로그인 요청을 처리하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setStatus(null);
    setNotifications([]);
    setMessage("");
  };

  const updateFeedbackEnabled = async (enabled: boolean) => {
    setSettingSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/feedback-settings", {
        method: "PUT",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ feedback_enabled: enabled }),
      });
      const data = await response.json() as {
        feedbackEnabled?: boolean;
        detail?: string;
      };
      if (!response.ok) {
        throw new Error(data.detail ?? "설정 변경 오류");
      }
      setStatus((current) => current
        ? { ...current, feedbackEnabled: data.feedbackEnabled === true }
        : current);
      setMessage(
        enabled
          ? "추천 피드백 수집을 시작했습니다."
          : "추천 피드백 수집과 화면 표시를 중지했습니다.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "추천 피드백 설정을 변경하지 못했습니다.",
      );
    } finally {
      setSettingSaving(false);
    }
  };

  const resetNotificationForm = () => {
    setEditingNotificationId(null);
    setNotificationPublisher("관리자");
    setNotificationContent("");
  };

  const saveNotification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotificationSaving(true);
    setMessage("");
    try {
      const editing = editingNotificationId !== null;
      const response = await fetch(
        editing
          ? `/api/admin/notifications/${editingNotificationId}`
          : "/api/admin/notifications",
        {
          method: editing ? "PUT" : "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            publisher: notificationPublisher,
            content: notificationContent,
          }),
        },
      );
      const data = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(data.detail ?? "알림 저장 오류");
      resetNotificationForm();
      await loadNotifications();
      setMessage(editing ? "알림 게시물을 수정했습니다." : "알림 게시물을 등록했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알림 게시물을 저장하지 못했습니다.");
    } finally {
      setNotificationSaving(false);
    }
  };

  const editNotification = (notification: NotificationPost) => {
    setEditingNotificationId(notification.id);
    setNotificationPublisher(notification.publisher);
    setNotificationContent(notification.content);
  };

  const deleteNotification = async (notification: NotificationPost) => {
    if (!window.confirm("이 알림 게시물을 삭제하시겠습니까?")) return;
    setNotificationSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/notifications/${notification.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json() as { detail?: string };
        throw new Error(data.detail ?? "알림 삭제 오류");
      }
      if (editingNotificationId === notification.id) resetNotificationForm();
      await loadNotifications();
      setMessage("알림 게시물을 삭제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알림 게시물을 삭제하지 못했습니다.");
    } finally {
      setNotificationSaving(false);
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
        <section className="admin-login-card" aria-labelledby="admin-login-title">
          <a className="admin-brand" href="/" aria-label="FindBid 검색으로 이동">
            <span>FB</span>
            <strong>FindBid</strong>
          </a>
          <span className="admin-kicker">RECOMMENDATION CONTROL</span>
          <h1 id="admin-login-title">추천 운영관리</h1>
          <p>관리자 비밀번호를 입력하면 세션 피드백과 적용 버전을 확인할 수 있습니다.</p>
          <form onSubmit={login}>
            <label htmlFor="admin-password">관리자 비밀번호</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
              placeholder="비밀번호 입력"
            />
            {message && <div className="admin-message error" role="alert">{message}</div>}
            <button type="submit" disabled={loading}>
              {loading ? "확인 중..." : "관리페이지 열기"}
            </button>
          </form>
          <small>관리 비밀번호는 서버 환경변수에서 변경할 수 있습니다.</small>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell admin-dashboard-shell">
      <header className="admin-topbar">
        <a className="admin-brand" href="/">
          <span>FB</span>
          <strong>FindBid</strong>
        </a>
        <nav className="admin-tabs" aria-label="관리자 메뉴">
          <a className="active" href="/admin" aria-current="page">운영 관리</a>
          <a href="/admin/activity-logs">DB 활동로그</a>
        </nav>
        <div>
          <button
            type="button"
            onClick={() => void Promise.all([loadStatus(), loadNotifications()])}
            disabled={loading || notificationLoading}
            aria-label="운영 상태와 알림 새로고침"
          >
            {loading || notificationLoading ? "갱신 중..." : "운영정보 새로고침"}
          </button>
          <button type="button" className="admin-logout" onClick={() => void logout()}>
            로그아웃
          </button>
        </div>
      </header>

      <section className="admin-dashboard" aria-labelledby="admin-dashboard-title">
        <div className="admin-dashboard-head">
          <div>
            <span className="admin-kicker">RECOMMENDATION CONTROL</span>
            <h1 id="admin-dashboard-title">추천 운영 현황</h1>
            <p>최근 2시간의 익명 세션 피드백과 현재 적용 중인 검색 버전입니다.</p>
          </div>
          <span className={`admin-health ${status?.redis.status === "정상" ? "ok" : "error"}`}>
            Redis {status?.redis.status ?? "확인 중"}
          </span>
        </div>

        {message && (
          <div
            className={`admin-message ${message.includes("못했") || message.includes("오류") ? "error" : "success"}`}
            role="status"
          >
            {message}
          </div>
        )}

        <section className="admin-feedback-control" aria-labelledby="feedback-control-title">
          <div>
            <span className="admin-control-kicker">FEEDBACK COLLECTION</span>
            <h2 id="feedback-control-title">추천 결과 피드백</h2>
            <p>
              사용 안 함으로 설정하면 공고 목록에서 피드백 영역을 숨기고,
              저장과 추천 점수 반영도 중지합니다.
            </p>
          </div>
          <div className="admin-feedback-toggle" role="group" aria-label="추천 피드백 수집 설정">
            <button
              type="button"
              className={status?.feedbackEnabled ? "active" : ""}
              aria-pressed={status?.feedbackEnabled === true}
              disabled={settingSaving || !status}
              onClick={() => void updateFeedbackEnabled(true)}
            >
              피드백 받음
            </button>
            <button
              type="button"
              className={status && !status.feedbackEnabled ? "active off" : ""}
              aria-pressed={status ? !status.feedbackEnabled : false}
              disabled={settingSaving || !status}
              onClick={() => void updateFeedbackEnabled(false)}
            >
              받지 않음
            </button>
          </div>
        </section>

        <section className="admin-notification-control" aria-labelledby="notification-control-title">
          <div className="admin-notification-head">
            <div>
              <span className="admin-control-kicker">SERVICE NOTIFICATIONS</span>
              <h2 id="notification-control-title">알림 게시물 관리</h2>
              <p>등록한 게시물은 사용자 알림 페이지에 최근 게시일시 순으로 표시됩니다.</p>
            </div>
            <span>{notifications.length.toLocaleString("ko-KR")}건</span>
          </div>

          <form className="admin-notification-form" onSubmit={saveNotification}>
            <label>
              <span>게시자</span>
              <input
                type="text"
                value={notificationPublisher}
                onChange={(event) => setNotificationPublisher(event.target.value)}
                maxLength={100}
                required
              />
            </label>
            <label>
              <span>내용</span>
              <textarea
                value={notificationContent}
                onChange={(event) => setNotificationContent(event.target.value)}
                maxLength={4000}
                rows={4}
                required
                placeholder="사용자에게 안내할 내용을 입력하세요."
              />
              <small>{notificationContent.length.toLocaleString("ko-KR")} / 4,000자</small>
            </label>
            <div className="admin-notification-form-actions">
              {editingNotificationId !== null && (
                <button type="button" onClick={resetNotificationForm} disabled={notificationSaving}>
                  수정 취소
                </button>
              )}
              <button type="submit" disabled={notificationSaving}>
                {notificationSaving
                  ? "저장 중..."
                  : editingNotificationId === null
                    ? "알림 등록"
                    : "수정 저장"}
              </button>
            </div>
          </form>

          <div className="admin-notification-table-wrap">
            <table className="admin-notification-table">
              <thead>
                <tr>
                  <th scope="col">게시일시</th>
                  <th scope="col">게시자</th>
                  <th scope="col">내용</th>
                  <th scope="col">관리</th>
                </tr>
              </thead>
              <tbody>
                {notificationLoading && notifications.length === 0 ? (
                  <tr><td colSpan={4}>알림 게시물을 불러오는 중입니다.</td></tr>
                ) : notifications.length === 0 ? (
                  <tr><td colSpan={4}>등록된 알림 게시물이 없습니다.</td></tr>
                ) : notifications.map((notification) => (
                  <tr key={notification.id}>
                    <td>{notificationPublishedAt(notification.publishedAt)}</td>
                    <td>{notification.publisher}</td>
                    <td>{notification.content}</td>
                    <td>
                      <div className="admin-notification-actions">
                        <button
                          type="button"
                          onClick={() => editNotification(notification)}
                          disabled={notificationSaving}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="delete"
                          onClick={() => void deleteNotification(notification)}
                          disabled={notificationSaving}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="admin-metrics">
          <article>
            <span>활성 세션</span>
            <strong>{status?.redis.activeSessions.toLocaleString("ko-KR") ?? 0}<em>개</em></strong>
          </article>
          <article>
            <span>전체 피드백</span>
            <strong>{status?.feedbackSummary.total.toLocaleString("ko-KR") ?? 0}<em>건</em></strong>
          </article>
          <article className="positive">
            <span>추천 적합</span>
            <strong>{status?.feedbackSummary.positive.toLocaleString("ko-KR") ?? 0}<em>건</em></strong>
          </article>
          <article className="negative">
            <span>추천 부적합·제외</span>
            <strong>
              {((status?.feedbackSummary.negative ?? 0) + (status?.feedbackSummary.exclude ?? 0)).toLocaleString("ko-KR")}
              <em>건</em>
            </strong>
          </article>
        </div>

        <div className="admin-grid">
          <section className="admin-panel">
            <div className="admin-panel-head">
              <h2>적용 버전</h2>
              <span>자동 분리 기준</span>
            </div>
            <dl className="admin-version-list">
              {Object.entries(status?.versions ?? {}).map(([name, value]) => (
                <div key={name}>
                  <dt>{versionLabels[name] ?? name}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <h2>부적합 사유</h2>
              <span>세션 TTL 내 집계</span>
            </div>
            {Object.keys(status?.feedbackReasons ?? {}).length === 0 ? (
              <div className="admin-empty">아직 수집된 부적합 사유가 없습니다.</div>
            ) : (
              <div className="admin-reason-list">
                {Object.entries(status?.feedbackReasons ?? {}).map(([reason, count]) => (
                  <div key={reason}>
                    <span>{reason}</span>
                    <strong>{count.toLocaleString("ko-KR")}건</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <p className="admin-footnote">
          세션 데이터는 마지막 활동 후 {Math.round((status?.redis.ttlSeconds ?? 7200) / 3600)}시간이 지나면 Redis에서 자동 삭제됩니다.
        </p>
      </section>
    </main>
  );
}
