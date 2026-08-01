"use client";

import { useState } from "react";
import { SiteFooter } from "./site-footer";

export type PublicInfoSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
};

type PublicInfoPageProps = {
  kicker: string;
  title: string;
  description: string;
  sections: PublicInfoSection[];
};

export function PublicInfoPage({
  kicker,
  title,
  description,
  sections,
}: PublicInfoPageProps) {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  return (
    <main className={`app-shell info-page ${theme}`}>
      <header className="topbar">
        <a className="logo" href="/" aria-label="FindBid 입찰탐색으로 이동">
          <span className="logo-symbol" aria-hidden="true">
            <img className="logo-mark logo-mark-light" src="/findbid-b-icon-3x.png" alt="" />
            <img className="logo-mark logo-mark-dark" src="/findbid-b-icon-3x-dark.png" alt="" />
          </span>
          <span className="logo-copy">
            <strong>
              <span className="word-find">Find</span>
              <span className="word-bid">Bid</span>
            </strong>
            <small>AI Bid Searcher</small>
          </span>
        </a>

        <nav className="main-nav" aria-label="주요 메뉴">
          <a href="/#search">입찰 탐색</a>
          <a href="/insights">인사이트</a>
          <a
            href="mailto:help_findbid@interweb.co.kr?subject=FindBid%20고객의%20소리"
          >
            고객의 소리
          </a>
        </nav>

        <div className="top-actions">
          <button
            className="icon-button theme-toggle"
            type="button"
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <section className="info-hero">
        <span className="section-kicker">{kicker}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>

      <article className="info-content">
        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.items && (
              <ul>
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
          </section>
        ))}
      </article>

      <SiteFooter />
    </main>
  );
}
