"use client";

import { useState } from "react";

const CUSTOMER_EMAIL = "help_findbid@interweb.co.kr";

export function SiteFooter() {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

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
          <small>© 2026 INTERWEB. All rights reserved.</small>
        </div>
        <nav className="site-footer-links" aria-label="하단 메뉴">
          <a href="/about">서비스 소개</a>
          <a href="/privacy">개인정보처리방침</a>
          <a href="/terms">이용약관</a>
          <div className="site-footer-contact">
            <strong>고객의 소리</strong>
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
        </nav>
      </div>
    </footer>
  );
}
