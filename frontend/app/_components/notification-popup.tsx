"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type NotificationPost = {
  id: number;
  publisher: string;
  content: string;
  publishedAt: string;
};

type NotificationPopupProps = {
  open: boolean;
  onClose: () => void;
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

function formatPublishedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatter.format(date);
}

export function NotificationPopup({ open, onClose }: NotificationPopupProps) {
  const [items, setItems] = useState<NotificationPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frameId = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
      void loadNotifications();
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [loadNotifications, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="notification-popup-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="notification-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-popup-title"
        aria-describedby="notification-popup-description"
      >
        <header className="notification-popup-head">
          <div>
            <span className="section-kicker">SERVICE NOTIFICATIONS</span>
            <h2 id="notification-popup-title">알림</h2>
            <p id="notification-popup-description">
              FindBid 운영자가 게시한 서비스 안내와 주요 소식입니다.
            </p>
          </div>
          <div className="notification-popup-head-actions">
            <button type="button" onClick={() => void loadNotifications()} disabled={loading}>
              {loading ? "불러오는 중" : "새로고침"}
            </button>
            <button
              ref={closeButtonRef}
              className="notification-popup-close"
              type="button"
              onClick={onClose}
              aria-label="알림 팝업 닫기"
            >
              ×
            </button>
          </div>
        </header>

        <div className="notification-popup-summary">
          <p>최근 게시된 알림부터 표시합니다.</p>
          <strong>{items.length.toLocaleString("ko-KR")}<em>건</em></strong>
        </div>
        {error && <div className="notifications-error" role="alert">{error}</div>}
        <div className="notifications-table-wrap notification-popup-table-wrap">
          <table className="notifications-table">
            <thead>
              <tr><th scope="col">게시일시</th><th scope="col">게시자</th><th scope="col">내용</th></tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr><td colSpan={3} className="notifications-empty">알림을 불러오는 중입니다.</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={3} className="notifications-empty">등록된 알림이 없습니다.</td></tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td>{formatPublishedAt(item.publishedAt)}</td>
                  <td>{item.publisher}</td>
                  <td>{item.content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
