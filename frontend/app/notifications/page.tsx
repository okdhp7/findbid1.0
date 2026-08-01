"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { SiteFooter } from "../_components/site-footer";
import { useSharedTheme } from "../_components/use-shared-theme";

type NotificationPost = {
  id: number;
  publisher: string;
  content: string;
  publishedAt: string;
};

const formatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

function publishedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatter.format(date);
}

export default function NotificationsPage() {
  const { theme, toggleTheme } = useSharedTheme();
  const [items, setItems] = useState<NotificationPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json() as {
        items?: NotificationPost[];
        detail?: string;
      };
      if (!response.ok) throw new Error(data.detail ?? "알림 조회 오류");
      setItems(data.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "알림 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => void loadNotifications());
    return () => window.cancelAnimationFrame(frameId);
  }, [loadNotifications]);

  return (
    <main className={`app-shell notifications-page ${theme}`}>
      <header className="topbar">
        <Link className="logo" href="/" aria-label="FindBid 입찰탐색으로 이동">
          <span className="logo-symbol" aria-hidden="true">
            <Image className="logo-mark logo-mark-light" src="/findbid-b-icon-3x.png" alt="" width={114} height={114} />
            <Image className="logo-mark logo-mark-dark" src="/findbid-b-icon-3x-dark.png" alt="" width={114} height={114} />
          </span>
          <span className="logo-copy">
            <strong><span className="word-find">Find</span><span className="word-bid">Bid</span></strong>
            <small>AI Bid Searcher</small>
          </span>
        </Link>

        <nav className="main-nav" aria-label="주요 메뉴">
          <Link href="/#search">
            <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4.5 4.5" />
            </svg>
            입찰 탐색
          </Link>
          <Link href="/insights">
            <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 19V11M12 19V5M19 19v-8" /><path d="m4 8 5-4 4 4 6-5" />
            </svg>
            인사이트
          </Link>
          <Link className="active" href="/notifications" aria-current="page">
            <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" />
            </svg>
            알림
          </Link>
        </nav>

        <div className="top-actions">
          <div className="connection-state" aria-label="검색 서비스 연결됨"><span /><small>연결됨</small></div>
          <button
            className="icon-button theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <section className="notifications-hero">
        <div>
          <span className="section-kicker">SERVICE NOTIFICATIONS</span>
          <h1>알림</h1>
          <p>FindBid 운영자가 게시한 서비스 안내와 주요 소식을 확인할 수 있습니다.</p>
        </div>
        <button type="button" onClick={() => void loadNotifications()} disabled={loading}>
          {loading ? "불러오는 중" : "새로고침"}
        </button>
      </section>

      <section className="notifications-main" aria-labelledby="notification-list-title">
        <div className="notifications-list-head">
          <div><h2 id="notification-list-title">알림 목록</h2><p>최근 게시된 알림부터 표시합니다.</p></div>
          <strong>{items.length.toLocaleString("ko-KR")}<em>건</em></strong>
        </div>
        {error && <div className="notifications-error" role="alert">{error}</div>}
        <div className="notifications-table-wrap">
          <table className="notifications-table">
            <thead><tr><th scope="col">게시일시</th><th scope="col">게시자</th><th scope="col">내용</th></tr></thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr><td colSpan={3} className="notifications-empty">알림을 불러오는 중입니다.</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={3} className="notifications-empty">등록된 알림이 없습니다.</td></tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td>{publishedAt(item.publishedAt)}</td>
                  <td>{item.publisher}</td>
                  <td>{item.content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
