"use client";

import { useEffect, useMemo, useState } from "react";
import { bids, companyProfile, type Bid } from "../lib/bids";

const categories = ["전체", "용역", "물품", "공사"] as const;
const regions = [
  "전체 지역",
  "전국",
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
];
const budgetOptions = [
  { label: "금액 전체", value: 0 },
  { label: "1억원 이하", value: 100_000_000 },
  { label: "3억원 이하", value: 300_000_000 },
  { label: "5억원 이하", value: 500_000_000 },
  { label: "10억원 이하", value: 1_000_000_000 },
  { label: "20억원 이하", value: 2_000_000_000 },
  { label: "30억원 이하", value: 3_000_000_000 },
  { label: "50억원 이하", value: 5_000_000_000 },
  { label: "100억원 이하", value: 10_000_000_000 },
  { label: "300억원 이하", value: 30_000_000_000 },
  { label: "500억원 이하", value: 50_000_000_000 },
  { label: "1,000억원 이하", value: 100_000_000_000 },
];

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <span className="brand-mark" aria-hidden="true">
      {children}
    </span>
  );
}

function StatusBadge({ value }: { value: Bid["eligibility"] }) {
  const className =
    value === "참가 가능"
      ? "status status-good"
      : value === "확인 필요"
        ? "status status-check"
        : "status status-bad";
  return <span className={className}>{value}</span>;
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div
      className="score-ring"
      style={{ "--score": score } as React.CSSProperties}
      aria-label={`AI 적합도 ${score}점`}
    >
      <div>
        <strong>{score}</strong>
        <span>적합도</span>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`toggle-row ${checked ? "is-on" : ""}`}
      onClick={onChange}
      aria-pressed={checked}
    >
      <span className="toggle-track">
        <span />
      </span>
      <span>{label}</span>
    </button>
  );
}

export default function Home() {
  const [category, setCategory] = useState<(typeof categories)[number]>("전체");
  const [region, setRegion] = useState("전체 지역");
  const [maxBudget, setMaxBudget] = useState(500000000);
  const [includeKeyword, setIncludeKeyword] = useState("AI, 시스템 구축");
  const [excludeKeyword, setExcludeKeyword] = useState("장비 납품, 상주 인력파견");
  const [semanticQuery, setSemanticQuery] = useState("");
  const [onlyEligible, setOnlyEligible] = useState(false);
  const [closingSoon, setClosingSoon] = useState(false);
  const [sort, setSort] = useState("score");
  const [searched, setSearched] = useState(true);
  const [resultBids, setResultBids] = useState<Bid[]>(bids);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<Bid | null>(null);
  const [saved, setSaved] = useState<string[]>([bids[0].id]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    if (!filtersOpen || !window.matchMedia("(max-width: 860px)").matches) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [filtersOpen]);

  const filteredBids = useMemo(() => {
    const include = includeKeyword
      .split(/[,，]/)
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean);
    const exclude = excludeKeyword
      .split(/[,，]/)
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean);

    return resultBids
      .filter((bid) => category === "전체" || bid.category === category)
      .filter((bid) => region === "전체 지역" || bid.region === region || bid.region === "전국")
      .filter((bid) => !maxBudget || bid.budget <= maxBudget)
      .filter((bid) => !onlyEligible || bid.eligibility === "참가 가능")
      .filter((bid) => !closingSoon || bid.daysLeft <= 7)
      .filter((bid) => {
        const text = [bid.title, bid.summary, ...bid.tags, ...bid.matched].join(" ").toLowerCase();
        const hasIncluded = include.length === 0 || include.some((word) => text.includes(word));
        const hasExcluded = exclude.some((word) => text.includes(word));
        return hasIncluded && !hasExcluded;
      })
      .sort((a, b) => {
        if (sort === "closing") return a.daysLeft - b.daysLeft;
        if (sort === "budget") return b.budget - a.budget;
        return b.score - a.score;
      });
  }, [resultBids, category, region, maxBudget, includeKeyword, excludeKeyword, onlyEligible, closingSoon, sort]);

  const runSearch = async () => {
    setSearched(false);
    setSearchError("");
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          category,
          region,
          maxBudget,
          includeKeywords: includeKeyword.split(/[,，]/).map((word) => word.trim()).filter(Boolean),
          excludeKeywords: excludeKeyword.split(/[,，]/).map((word) => word.trim()).filter(Boolean),
          onlyEligible,
          closingWithinDays: closingSoon ? 7 : null,
          semanticQuery,
        }),
      });
      if (!response.ok) {
        throw new Error("검색 서비스 응답 오류");
      }
      const data = (await response.json()) as { items: Bid[] };
      setResultBids(data.items);
    } catch {
      setSearchError("검색 백엔드에 연결할 수 없어 화면의 데모 데이터를 표시합니다.");
      setResultBids(bids);
    } finally {
      setSearched(true);
    }
  };

  const toggleSaved = (id: string) => {
    setSaved((current) =>
      current.includes(id) ? current.filter((savedId) => savedId !== id) : [...current, id],
    );
  };

  return (
    <main className={`app-shell ${theme}`}>
      {/* ── Topbar ── */}
      <header className="topbar">
        <a className="logo" href="#top" aria-label="FindBid 홈">
          <span className="logo-symbol">F</span>
          <span className="logo-copy">
            <strong>Find<span>Bid</span></strong>
            <small>AI PROCUREMENT</small>
          </span>
        </a>

        <nav className="main-nav" aria-label="주요 메뉴">
          <a className="active" href="#search">입찰 탐색</a>
          <a href="#saved">
            관심 공고
            <em>{saved.length}</em>
          </a>
          <a href="#insight">인사이트</a>
          <a href="#alerts">알림</a>
        </nav>

        <div className="top-actions">
          <div className="connection-state" aria-label="검색 서비스 연결됨">
            <span />
            <small>연결됨</small>
          </div>
          <button
            className="icon-button theme-toggle"
            type="button"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
          >
            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
          </button>
          <button className="icon-button notification-button" type="button" aria-label="알림">
            <span aria-hidden="true">♢</span>
            <i />
          </button>
          <button className="profile-button" type="button" onClick={() => setProfileOpen(true)}>
            <span className="avatar">IB</span>
            <span className="profile-copy">
              <strong>{companyProfile.name}</strong>
              <small>프로필 {companyProfile.completion}% 완성</small>
            </span>
            <span aria-hidden="true">⌄</span>
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hero" id="top">
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
        <div className="hero-inner">
          <div className="eyebrow">
            <span />
            AI PROCUREMENT INTELLIGENCE
          </div>
          <h1>
            우리 회사에 맞는 입찰,<br />
            <span>AI가 먼저 찾아드립니다.</span>
          </h1>
          <p>
            나라장터 공고와 제안요청서를 분석해<br />
            참가 가능한 사업만 정교하게 선별합니다.
          </p>

          {/* Semantic Search Card */}
          <div className="semantic-card" id="search">
            <div className="search-head">
              <div>
                <span className="spark" aria-hidden="true">✦</span>
                <strong>AI 시맨틱 검색</strong>
                <span className="beta">BETA</span>
              </div>
              <button type="button" onClick={() => setSemanticQuery("")}>
                입력 지우기
              </button>
            </div>
            <div className="semantic-input">
              <textarea
                value={semanticQuery}
                onChange={(event) => setSemanticQuery(event.target.value)}
                aria-label="찾고 싶은 입찰사업을 자연어로 입력"
                placeholder="예: 수도권 공공기관의 AI 기반 웹서비스 구축 사업. Java, React, Python 기술을 활용하고 5억원 이하인 사업을 찾습니다."
              />
              <button type="button" onClick={runSearch} className="search-button">
                <span aria-hidden="true">⌕</span>
                {searched ? "AI로 검색" : "분석 중…"}
              </button>
            </div>
            <div className="parsed-intent">
              <span className="intent-label">AI가 이해한 조건</span>
              <span>수도권</span>
              <span>5억원 이하</span>
              <span>AI · 웹서비스</span>
              <span>Java · React · Python</span>
              <span className="exclude">장비 납품 제외</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Workspace ── */}
      <section className="workspace">
        {filtersOpen && (
          <button
            className="filter-backdrop"
            type="button"
            onClick={() => setFiltersOpen(false)}
            aria-label="상세 조건 닫기"
          />
        )}

        {/* Filter Sidebar */}
        <aside
          id="mobile-filters"
          className={`filters ${filtersOpen ? "mobile-open" : ""}`}
          aria-label="상세 검색 조건"
        >
          <div className="aside-title">
            <div>
              <span className="section-kicker">SEARCH FILTER</span>
              <h2>상세 조건</h2>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              aria-label="필터 닫기"
            >
              ×
            </button>
          </div>

          <div className="filter-scroll">

          {/* Category */}
          <div className="filter-group">
            <label>업무 구분</label>
            <div className="segment-control">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={category === item ? "active" : ""}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* Region & Budget */}
          <div className="filter-group two-cols">
            <div>
              <label htmlFor="region">참가 지역</label>
              <select
                id="region"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
              >
                {regions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="budget">사업 금액</label>
              <select
                id="budget"
                value={maxBudget}
                onChange={(event) => setMaxBudget(Number(event.target.value))}
              >
                {budgetOptions.map((item) => (
                  <option key={item.label} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Include Keywords */}
          <div className="filter-group">
            <label htmlFor="include">포함 키워드</label>
            <div className="input-with-icon">
              <span aria-hidden="true">＋</span>
              <input
                id="include"
                value={includeKeyword}
                onChange={(event) => setIncludeKeyword(event.target.value)}
                placeholder="AI, 웹서비스, 플랫폼"
              />
            </div>
            <small>쉼표로 여러 키워드를 구분할 수 있습니다.</small>
          </div>

          {/* Exclude Keywords */}
          <div className="filter-group">
            <label htmlFor="exclude">제외 키워드</label>
            <div className="input-with-icon danger">
              <span aria-hidden="true">－</span>
              <input
                id="exclude"
                value={excludeKeyword}
                onChange={(event) => setExcludeKeyword(event.target.value)}
                placeholder="장비 납품, 인력파견"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="filter-group toggle-group">
            <Toggle
              checked={onlyEligible}
              onChange={() => setOnlyEligible((value) => !value)}
              label="참가 가능 공고만"
            />
            <Toggle
              checked={closingSoon}
              onChange={() => setClosingSoon((value) => !value)}
              label="7일 이내 마감"
            />
          </div>

          {/* Action Buttons */}
          <button
            className="apply-button"
            type="button"
            onClick={() => { runSearch(); setFiltersOpen(false); }}
          >
            조건 적용하기
          </button>
          <button
            className="reset-button"
            type="button"
            onClick={() => {
              setCategory("전체");
              setRegion("전체 지역");
              setMaxBudget(0);
              setIncludeKeyword("");
              setExcludeKeyword("");
              setOnlyEligible(false);
              setClosingSoon(false);
            }}
          >
            조건 초기화
          </button>

          {/* Profile Health */}
          <div className="profile-health">
            <div className="health-head">
              <div>
                <Mark>IB</Mark>
                <span>
                  <strong>기업 프로필</strong>
                  <small>매칭 정확도를 높여보세요</small>
                </span>
              </div>
              <strong>{companyProfile.completion}%</strong>
            </div>
            <div className="progress">
              <span style={{ width: `${companyProfile.completion}%` }} />
            </div>
            <button type="button" onClick={() => setProfileOpen(true)}>
              프로필 보완하기
              <span>→</span>
            </button>
          </div>
          </div>
        </aside>

        {/* Results */}
        <div className="results">
          {/* Metric Cards */}
          <div className="metrics">
            <article>
              <span className="metric-icon mint">⌕</span>
              <div>
                <small>검색된 공고</small>
                <strong>1,284<em>건</em></strong>
              </div>
              <span className="trend">+42 오늘</span>
            </article>
            <article>
              <span className="metric-icon blue">✓</span>
              <div>
                <small>참가 가능</small>
                <strong>38<em>건</em></strong>
              </div>
              <span className="trend">상위 3%</span>
            </article>
            <article>
              <span className="metric-icon gold">✦</span>
              <div>
                <small>평균 적합도</small>
                <strong>87<em>점</em></strong>
              </div>
              <span className="trend">매우 높음</span>
            </article>
            <article>
              <span className="metric-icon rose">◷</span>
              <div>
                <small>7일 내 마감</small>
                <strong>12<em>건</em></strong>
              </div>
              <span className="trend warning">확인 필요</span>
            </article>
          </div>

          {/* Toolbar */}
          <div className="result-toolbar">
            <div>
              <button
                className="mobile-filter"
                type="button"
                onClick={() => setFiltersOpen(true)}
                aria-controls="mobile-filters"
                aria-expanded={filtersOpen}
              >
                ☷ 상세 조건
              </button>
              <span className="section-kicker">RECOMMENDED BIDS</span>
              <h2>
                AI 추천 입찰공고
                <span>{filteredBids.length}</span>
              </h2>
              <p>기업 프로필과 선택 조건을 기준으로 관련성이 높은 순서입니다.</p>
            </div>
            <div className="toolbar-actions">
              <button type="button" className="save-search">＋ 검색조건 저장</button>
              <select
                aria-label="정렬 기준"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="score">적합도 높은 순</option>
                <option value="closing">마감 임박 순</option>
                <option value="budget">금액 높은 순</option>
              </select>
            </div>
          </div>

          {/* Bid List */}
          <div className={`result-list ${searched ? "" : "is-loading"}`}>
            {filteredBids.length === 0 ? (
              <div className="empty-state">
                <span>⌕</span>
                <h3>조건에 맞는 공고가 없습니다</h3>
                <p>포함 키워드를 줄이거나 사업 금액 범위를 넓혀보세요.</p>
                <button
                  type="button"
                  onClick={() => { setIncludeKeyword(""); setMaxBudget(0); }}
                >
                  조건 완화하기
                </button>
              </div>
            ) : (
              filteredBids.map((bid) => (
                <article className="bid-card" key={bid.id}>
                  <div className="bid-score">
                    <ScoreRing score={bid.score} />
                    <StatusBadge value={bid.eligibility} />
                  </div>
                  <div className="bid-content">
                    <div className="bid-meta-top">
                      <span className={`category category-${bid.category}`}>{bid.category}</span>
                      {bid.isNew && <span className="new-label">NEW</span>}
                      <span>{bid.noticeNo}</span>
                      <button
                        type="button"
                        className={`bookmark ${saved.includes(bid.id) ? "saved" : ""}`}
                        onClick={() => toggleSaved(bid.id)}
                        aria-label={saved.includes(bid.id) ? "관심 공고 해제" : "관심 공고 저장"}
                      >
                        {saved.includes(bid.id) ? "◆" : "◇"}
                      </button>
                    </div>
                    <button
                      className="bid-title"
                      type="button"
                      onClick={() => setSelected(bid)}
                    >
                      {bid.title}
                    </button>
                    <p className="bid-summary">{bid.summary}</p>

                    <div className="bid-facts">
                      <div>
                        <span>수요기관</span>
                        <strong>{bid.demandAgency}</strong>
                      </div>
                      <div>
                        <span>추정금액</span>
                        <strong>{bid.budgetLabel}</strong>
                      </div>
                      <div>
                        <span>계약방법</span>
                        <strong>{bid.contractMethod}</strong>
                      </div>
                      <div>
                        <span>참가지역</span>
                        <strong>{bid.region}</strong>
                      </div>
                    </div>

                    <div className="match-row">
                      <span className="match-label">일치 역량</span>
                      {bid.matched.map((item) => (
                        <span key={item}>✓ {item}</span>
                      ))}
                    </div>
                  </div>
                  <div className="bid-deadline">
                    <span>입찰 마감</span>
                    <strong>D-{bid.daysLeft}</strong>
                    <time>{bid.closeAt}</time>
                    <button type="button" onClick={() => setSelected(bid)}>
                      상세 분석
                      <span>→</span>
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="source-note">
            <span>ⓘ</span>
            {searchError || "FastAPI 검색 서비스와 연결되어 있습니다. 나라장터 인증키를 설정하면 실제 공고 수집 모드로 전환됩니다."}
          </div>
        </div>
      </section>

      {/* ── Detail Drawer ── */}
      {selected && (
        <div
          className="drawer-layer"
          role="presentation"
          onMouseDown={() => setSelected(null)}
        >
          <aside
            className="detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="입찰공고 상세 분석"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <span className={`category category-${selected.category}`}>{selected.category}</span>
                <span>{selected.noticeNo}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="상세 창 닫기"
              >
                ×
              </button>
            </div>

            <div className="drawer-title">
              <ScoreRing score={selected.score} />
              <div>
                <StatusBadge value={selected.eligibility} />
                <h2>{selected.title}</h2>
                <p>{selected.agency} · {selected.demandAgency}</p>
              </div>
            </div>

            <div className="ai-brief">
              <div>
                <span>✦</span>
                <strong>AI 핵심 분석</strong>
              </div>
              <p>{selected.summary}</p>
              <p>귀사의 보유 기술과 유사성이 높으며, 필수 자격 중 확인되지 않은 증빙자료는 제출 전 검토가 필요합니다.</p>
            </div>

            <div className="drawer-grid">
              <div>
                <span>추정금액</span>
                <strong>{selected.budgetLabel}</strong>
              </div>
              <div>
                <span>마감일시</span>
                <strong>{selected.closeAt}</strong>
              </div>
              <div>
                <span>계약방법</span>
                <strong>{selected.contractMethod}</strong>
              </div>
              <div>
                <span>낙찰방법</span>
                <strong>{selected.awardMethod}</strong>
              </div>
            </div>

            <section className="analysis-section">
              <h3>
                <span className="dot good" />
                일치하는 기업 역량
              </h3>
              <ul>
                {selected.matched.map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
            </section>

            <section className="analysis-section">
              <h3>
                <span className="dot navy" />
                핵심 참가자격
              </h3>
              <ul>
                {selected.requirements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="analysis-section">
              <h3>
                <span className="dot warning" />
                확인할 사항
              </h3>
              <ul className="risk-list">
                {selected.risks.map((item) => (
                  <li key={item}>! {item}</li>
                ))}
              </ul>
            </section>

            <div className="drawer-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={() => toggleSaved(selected.id)}
              >
                {saved.includes(selected.id) ? "◆ 저장됨" : "◇ 관심공고 저장"}
              </button>
              <button className="primary-action" type="button">
                나라장터 원문 보기 →
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Profile Modal ── */}
      {profileOpen && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={() => setProfileOpen(false)}
        >
          <section
            className="profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="기업 프로필"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setProfileOpen(false)}
              aria-label="모달 닫기"
            >
              ×
            </button>
            <Mark>IB</Mark>
            <span className="section-kicker">COMPANY PROFILE</span>
            <h2>{companyProfile.name}</h2>
            <p>기업 정보를 기반으로 공고 참가 가능성과 사업 적합도를 분석합니다.</p>
            <div className="profile-completion">
              <div>
                <span>프로필 완성도</span>
                <strong>{companyProfile.completion}%</strong>
              </div>
              <div className="progress">
                <span style={{ width: `${companyProfile.completion}%` }} />
              </div>
            </div>
            <dl>
              <div>
                <dt>소재지</dt>
                <dd>{companyProfile.location}</dd>
              </div>
              <div>
                <dt>기업규모</dt>
                <dd>{companyProfile.size}</dd>
              </div>
              <div>
                <dt>보유면허</dt>
                <dd>{companyProfile.licenses.join(" · ")}</dd>
              </div>
              <div>
                <dt>핵심기술</dt>
                <dd>{companyProfile.technologies.join(" · ")}</dd>
              </div>
            </dl>
            <button
              className="primary-action full"
              type="button"
              onClick={() => setProfileOpen(false)}
            >
              기업 정보 관리
            </button>
          </section>
        </div>
      )}

      {/* ── Mobile Dock ── */}
      <nav className="mobile-dock" aria-label="모바일 주요 메뉴">
        <a className="active" href="#search">
          <span aria-hidden="true">⌕</span>
          <small>탐색</small>
        </a>
        <a href="#saved">
          <span aria-hidden="true">◇</span>
          <small>관심공고</small>
        </a>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          aria-controls="mobile-filters"
          aria-expanded={filtersOpen}
        >
          <span aria-hidden="true">≡</span>
          <small>필터</small>
        </button>
        <button type="button" onClick={() => setProfileOpen(true)}>
          <span aria-hidden="true">○</span>
          <small>프로필</small>
        </button>
      </nav>
    </main>
  );
}
