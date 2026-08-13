"use client";

import { useEffect, useRef, useState } from "react";
import packageJson from "../../package.json";

const CUSTOMER_EMAIL = "help_findbid@interweb.co.kr";
const APP_VERSION = packageJson.version;
const RELEASED_AT = packageJson.releaseDate;
const RELEASE_LABEL = process.env.NODE_ENV === "production" ? "Rel" : "Dev";

function formatReleasedAt(value: string): string {
  const localDateTime = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(value);
  if (localDateTime) {
    return `${localDateTime[1]}.${localDateTime[2]}.${localDateTime[3]} ${localDateTime[4]}:${localDateTime[5]}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "배포 일시 확인 불가";

  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}.${part("month")}.${part("day")} ${part("hour")}:${part("minute")}`;
}

export function SiteFooter() {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [contactOpen, setContactOpen] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contactOpen) return;

    const closeOutside = (event: PointerEvent) => {
      if (!contactRef.current?.contains(event.target as Node)) setContactOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContactOpen(false);
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [contactOpen]);

  const copyCustomerEmail = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(CUSTOMER_EMAIL);
      } else {
        const copyTarget = document.createElement("textarea");
        copyTarget.value = CUSTOMER_EMAIL;
        copyTarget.setAttribute("readonly", "");
        copyTarget.style.position = "fixed";
        copyTarget.style.opacity = "0";
        document.body.appendChild(copyTarget);
        copyTarget.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(copyTarget);
        if (!copied) throw new Error("이메일 주소 복사 실패");
      }
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1800);
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <strong>FindBid</strong>
          <p>기업 역량에 맞는 공공 입찰 기회를 찾는 AI 입찰 탐색 서비스</p>
          <div className="site-footer-meta">
            <small>© 2026 INTERWEB. All rights reserved.</small>
            <small className="site-footer-release">
              Ver. {APP_VERSION} · {formatReleasedAt(RELEASED_AT)} {RELEASE_LABEL}
            </small>
          </div>
        </div>
        <nav className="site-footer-links" aria-label="하단 메뉴">
          <a href="/about">서비스 소개</a>
          <a href="/privacy">개인정보처리방침</a>
          <a href="/terms">이용약관</a>
          <div
            className={`site-footer-contact ${contactOpen ? "is-open" : ""}`}
            ref={contactRef}
          >
            <button
              className="site-footer-contact-trigger"
              type="button"
              aria-controls="site-footer-contact-popover"
              aria-expanded={contactOpen}
              onClick={() => setContactOpen((current) => !current)}
            >
              고객의 소리
            </button>
            <div
              className="site-footer-contact-popover"
              id="site-footer-contact-popover"
              role="group"
              aria-label="고객의 소리 안내"
            >
              <p>서비스에 대한 문의 또는 제안 사항을 보내실 수 있습니다.</p>
              <div className="site-footer-contact-row">
                <a
                  href="mailto:help_findbid@interweb.co.kr?subject=FindBid%20고객의%20소리"
                  aria-label="고객의 소리 이메일 보내기"
                >
                  {CUSTOMER_EMAIL}
                </a>
                <button
                  type="button"
                  onClick={() => void copyCustomerEmail()}
                  aria-label="고객의 소리 이메일 주소 복사"
                >
                  {copyStatus === "copied"
                    ? "복사됨"
                    : copyStatus === "failed"
                      ? "복사 실패"
                      : "주소 복사"}
                </button>
              </div>
              <span className="sr-only" aria-live="polite">
                {copyStatus === "copied" ? "이메일 주소가 복사되었습니다." : ""}
              </span>
            </div>
          </div>
        </nav>
      </div>
    </footer>
  );
}
