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
  }, [loadStatus]);

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
      await loadStatus();
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

  if (authenticated !== true) {
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
        <div>
          <button type="button" onClick={() => void loadStatus()} disabled={loading}>
            {loading ? "갱신 중..." : "새로고침"}
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
