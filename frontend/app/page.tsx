"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { companyProfile, type Bid } from "../lib/bids";

const categories = ["전체", "용역", "물품", "공사"] as const;
const regions = [
  "전체 지역",
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

type SearchSnapshot = {
  category: (typeof categories)[number];
  region: string;
  maxBudget: number;
  includeKeyword: string;
  excludeKeyword: string;
  semanticQuery: string;
  onlyEligible: boolean;
  closingSoon: boolean;
};

const DEFAULT_SEARCH: SearchSnapshot = {
  category: "전체",
  region: "전체 지역",
  maxBudget: 500_000_000,
  includeKeyword: "",
  excludeKeyword: "",
  semanticQuery: "",
  onlyEligible: false,
  closingSoon: false,
};

const PAGE_SIZE = 20;

type SavedSearch = {
  id: string;
  name: string;
  createdAt: string;
  filters: SearchSnapshot;
};

const SAVED_SEARCHES_KEY = "findbid.saved-searches.v1";

function normalizeRegionFilter(region: string) {
  return region === "전국" ? "전체 지역" : region;
}

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
  const resultTopRef = useRef<HTMLDivElement>(null);
  const resultBottomRef = useRef<HTMLDivElement>(null);
  const autoSearchTimerRef = useRef<number | null>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const searchRequestIdRef = useRef(0);
  const [category, setCategory] = useState<(typeof categories)[number]>(DEFAULT_SEARCH.category);
  const [region, setRegion] = useState(DEFAULT_SEARCH.region);
  const [maxBudget, setMaxBudget] = useState(DEFAULT_SEARCH.maxBudget);
  const [includeKeyword, setIncludeKeyword] = useState(DEFAULT_SEARCH.includeKeyword);
  const [excludeKeyword, setExcludeKeyword] = useState(DEFAULT_SEARCH.excludeKeyword);
  const [semanticQuery, setSemanticQuery] = useState(DEFAULT_SEARCH.semanticQuery);
  const [onlyEligible, setOnlyEligible] = useState(DEFAULT_SEARCH.onlyEligible);
  const [closingSoon, setClosingSoon] = useState(DEFAULT_SEARCH.closingSoon);
  const [sort, setSort] = useState("score");
  const [searched, setSearched] = useState(false);
  const [resultBids, setResultBids] = useState<Bid[]>([]);
  const [databaseTotal, setDatabaseTotal] = useState(0);
  const [searchTotal, setSearchTotal] = useState(0);
  const [eligibleTotal, setEligibleTotal] = useState(0);
  const [closingSoonTotal, setClosingSoonTotal] = useState(0);
  const [averageScore, setAverageScore] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<Bid | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const [savedSearchName, setSavedSearchName] = useState("");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem(SAVED_SEARCHES_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored) as SavedSearch[];
      return Array.isArray(parsed)
        ? parsed.map((savedSearch) => ({
            ...savedSearch,
            filters: {
              ...savedSearch.filters,
              region: normalizeRegionFilter(savedSearch.filters.region),
            },
          }))
        : [];
    } catch {
      return [];
    }
  });
  const [saveNotice, setSaveNotice] = useState("");
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

  const totalPages = Math.ceil(searchTotal / PAGE_SIZE);
  const pageWindowStart = Math.max(
    1,
    Math.min(currentPage - 2, Math.max(1, totalPages - 4)),
  );
  const pageWindowEnd = Math.min(totalPages, pageWindowStart + 4);
  const pageNumbers = Array.from(
    { length: Math.max(0, pageWindowEnd - pageWindowStart + 1) },
    (_, index) => pageWindowStart + index,
  );

  const currentSearchSnapshot = (): SearchSnapshot => ({
    category,
    region,
    maxBudget,
    includeKeyword,
    excludeKeyword,
    semanticQuery,
    onlyEligible,
    closingSoon,
  });

  const runSearch = useCallback(async (snapshot: SearchSnapshot, page = 1) => {
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    searchAbortControllerRef.current?.abort();
    const controller = new AbortController();
    searchAbortControllerRef.current = controller;
    setSearched(false);
    setSearchError("");
    setCurrentPage(page);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        signal: controller.signal,
        body: JSON.stringify({
          category: snapshot.category,
          region: snapshot.region,
          maxBudget: snapshot.maxBudget,
          includeKeywords: snapshot.includeKeyword.split(/[,，]/).map((word) => word.trim()).filter(Boolean),
          excludeKeywords: snapshot.excludeKeyword.split(/[,，]/).map((word) => word.trim()).filter(Boolean),
          onlyEligible: snapshot.onlyEligible,
          closingWithinDays: snapshot.closingSoon ? 7 : null,
          semanticQuery: snapshot.semanticQuery,
          page,
          limit: PAGE_SIZE,
        }),
      });
      if (!response.ok) {
        throw new Error("검색 서비스 응답 오류");
      }
      const data = (await response.json()) as {
        databaseTotal: number;
        total: number;
        eligibleTotal: number;
        closingSoonTotal: number;
        averageScore: number;
        items: Bid[];
      };
      if (
        !Array.isArray(data.items)
        || typeof data.databaseTotal !== "number"
        || typeof data.total !== "number"
        || typeof data.eligibleTotal !== "number"
        || typeof data.closingSoonTotal !== "number"
        || typeof data.averageScore !== "number"
      ) {
        throw new Error("검색 결과 형식 오류");
      }
      if (requestId !== searchRequestIdRef.current) return;
      setResultBids(data.items);
      setDatabaseTotal(data.databaseTotal);
      setSearchTotal(data.total);
      setEligibleTotal(data.eligibleTotal);
      setClosingSoonTotal(data.closingSoonTotal);
      setAverageScore(data.averageScore);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (requestId !== searchRequestIdRef.current) return;
      setSearchError("검색 서비스에 연결할 수 없습니다. 잠시 후 다시 검색해 주세요.");
      setResultBids([]);
      setDatabaseTotal(0);
      setSearchTotal(0);
      setEligibleTotal(0);
      setClosingSoonTotal(0);
      setAverageScore(0);
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setSearched(true);
      }
    }
  }, []);

  const cancelScheduledSearch = () => {
    if (autoSearchTimerRef.current === null) return;
    window.clearTimeout(autoSearchTimerRef.current);
    autoSearchTimerRef.current = null;
  };

  const runSearchNow = (snapshot: SearchSnapshot, page = 1) => {
    cancelScheduledSearch();
    void runSearch(snapshot, page);
  };

  const scheduleDetailSearch = (snapshot: SearchSnapshot, delay: number) => {
    cancelScheduledSearch();
    autoSearchTimerRef.current = window.setTimeout(() => {
      autoSearchTimerRef.current = null;
      void runSearch(snapshot, 1);
    }, delay);
  };

  const scrollToResultBoundary = (boundary: "top" | "bottom") => {
    const target = boundary === "top" ? resultTopRef.current : resultBottomRef.current;
    if (!target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: boundary === "top" ? "start" : "end",
    });
  };

  useEffect(() => {
    const initialSearch = window.setTimeout(() => {
      void runSearch(DEFAULT_SEARCH);
    }, 0);
    return () => {
      window.clearTimeout(initialSearch);
      if (autoSearchTimerRef.current !== null) {
        window.clearTimeout(autoSearchTimerRef.current);
      }
      searchAbortControllerRef.current?.abort();
    };
  }, [runSearch]);

  const showSaveNotice = (message: string) => {
    setSaveNotice(message);
    window.setTimeout(() => setSaveNotice(""), 2400);
  };

  const persistSavedSearches = (next: SavedSearch[]) => {
    setSavedSearches(next);
    window.localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(next));
  };

  const openSaveSearch = () => {
    const keyword = includeKeyword.split(/[,，]/).map((word) => word.trim()).find(Boolean);
    const location = region === "전체 지역" ? "전체 지역" : region;
    setSavedSearchName(`${location} ${keyword || category} 검색`);
    setSaveSearchOpen(true);
  };

  const saveCurrentSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = savedSearchName.trim();
    if (!name) return;
    const next: SavedSearch[] = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        createdAt: new Date().toISOString(),
        filters: currentSearchSnapshot(),
      },
      ...savedSearches,
    ].slice(0, 20);
    persistSavedSearches(next);
    setSaveSearchOpen(false);
    showSaveNotice("검색조건을 저장했습니다.");
  };

  const applySavedSearch = (savedSearch: SavedSearch) => {
    const snapshot = {
      ...savedSearch.filters,
      region: normalizeRegionFilter(savedSearch.filters.region),
    };
    setCategory(snapshot.category);
    setRegion(snapshot.region);
    setMaxBudget(snapshot.maxBudget);
    setIncludeKeyword(snapshot.includeKeyword);
    setExcludeKeyword(snapshot.excludeKeyword);
    setSemanticQuery(snapshot.semanticQuery);
    setOnlyEligible(snapshot.onlyEligible);
    setClosingSoon(snapshot.closingSoon);
    setSaveSearchOpen(false);
    showSaveNotice(`‘${savedSearch.name}’ 조건을 적용했습니다.`);
    runSearchNow(snapshot);
  };

  const deleteSavedSearch = (id: string) => {
    persistSavedSearches(savedSearches.filter((savedSearch) => savedSearch.id !== id));
    showSaveNotice("저장한 검색조건을 삭제했습니다.");
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
              <button type="button" onClick={() => runSearchNow(currentSearchSnapshot())} className="search-button">
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
                  onClick={() => {
                    setCategory(item);
                    scheduleDetailSearch(
                      { ...currentSearchSnapshot(), category: item },
                      0,
                    );
                  }}
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
                onChange={(event) => {
                  const nextRegion = event.target.value;
                  setRegion(nextRegion);
                  scheduleDetailSearch(
                    { ...currentSearchSnapshot(), region: nextRegion },
                    0,
                  );
                }}
              >
                {regions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="budget">사업 금액</label>
              <select
                id="budget"
                value={maxBudget}
                onChange={(event) => {
                  const nextBudget = Number(event.target.value);
                  setMaxBudget(nextBudget);
                  scheduleDetailSearch(
                    { ...currentSearchSnapshot(), maxBudget: nextBudget },
                    0,
                  );
                }}
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
                onChange={(event) => {
                  const nextKeyword = event.target.value;
                  setIncludeKeyword(nextKeyword);
                  scheduleDetailSearch(
                    { ...currentSearchSnapshot(), includeKeyword: nextKeyword },
                    500,
                  );
                }}
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
                onChange={(event) => {
                  const nextKeyword = event.target.value;
                  setExcludeKeyword(nextKeyword);
                  scheduleDetailSearch(
                    { ...currentSearchSnapshot(), excludeKeyword: nextKeyword },
                    500,
                  );
                }}
                placeholder="장비 납품, 인력파견"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="filter-group toggle-group">
            <Toggle
              checked={onlyEligible}
              onChange={() => {
                const nextOnlyEligible = !onlyEligible;
                setOnlyEligible(nextOnlyEligible);
                scheduleDetailSearch(
                  { ...currentSearchSnapshot(), onlyEligible: nextOnlyEligible },
                  0,
                );
              }}
              label="참가 가능 공고만"
            />
            <Toggle
              checked={closingSoon}
              onChange={() => {
                const nextClosingSoon = !closingSoon;
                setClosingSoon(nextClosingSoon);
                scheduleDetailSearch(
                  { ...currentSearchSnapshot(), closingSoon: nextClosingSoon },
                  0,
                );
              }}
              label="7일 이내 마감"
            />
          </div>

          {/* Action Buttons */}
          <button
            className="apply-button"
            type="button"
            onClick={() => { runSearchNow(currentSearchSnapshot()); setFiltersOpen(false); }}
          >
            조건 적용하기
          </button>
          <button
            className="reset-button"
            type="button"
            onClick={() => {
              const resetSnapshot = {
                ...currentSearchSnapshot(),
                category: "전체" as const,
                region: "전체 지역",
                maxBudget: 0,
                includeKeyword: "",
                excludeKeyword: "",
                onlyEligible: false,
                closingSoon: false,
              };
              setCategory("전체");
              setRegion("전체 지역");
              setMaxBudget(0);
              setIncludeKeyword("");
              setExcludeKeyword("");
              setOnlyEligible(false);
              setClosingSoon(false);
              runSearchNow(resetSnapshot);
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
                <small>전체 공고</small>
                <strong>{databaseTotal.toLocaleString("ko-KR")}<em>건</em></strong>
              </div>
              <span className="trend">DB 검색 결과</span>
            </article>
            <article>
              <span className="metric-icon blue">✓</span>
              <div>
                <small>참가 가능</small>
                <strong>{eligibleTotal.toLocaleString("ko-KR")}<em>건</em></strong>
              </div>
              <span className="trend">조건 기준</span>
            </article>
            <article>
              <span className="metric-icon gold">✦</span>
              <div>
                <small>평균 적합도</small>
                <strong>{averageScore.toLocaleString("ko-KR")}<em>점</em></strong>
              </div>
              <span className="trend">조건 기준</span>
            </article>
            <article>
              <span className="metric-icon rose">◷</span>
              <div>
                <small>7일 내 마감</small>
                <strong>{closingSoonTotal.toLocaleString("ko-KR")}<em>건</em></strong>
              </div>
              <span className="trend warning">조건 기준</span>
            </article>
          </div>

          {/* Toolbar */}
          <div className="result-toolbar" ref={resultTopRef}>
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
                <span className="recommendation-count">
                  {searchTotal.toLocaleString("ko-KR")}<em>건</em>
                </span>
              </h2>
              <p>기업 프로필과 선택 조건을 기준으로 관련성이 높은 순서입니다.</p>
            </div>
            <div className="toolbar-actions">
              <button type="button" className="save-search" onClick={openSaveSearch}>
                ＋ 검색조건 저장
              </button>
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
            {!searched ? (
              <div className="empty-state" role="status">
                <span>⌕</span>
                <h3>실제 입찰공고를 불러오는 중입니다</h3>
                <p>검색조건에 맞는 공고를 데이터베이스에서 조회하고 있습니다.</p>
              </div>
            ) : filteredBids.length === 0 ? (
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
              filteredBids.map((bid, index) => (
                <article className="bid-card" key={bid.id}>
                  <span
                    className="bid-sequence"
                    aria-label={`검색결과 ${(currentPage - 1) * PAGE_SIZE + index + 1}번`}
                  >
                    {(currentPage - 1) * PAGE_SIZE + index + 1}
                  </span>
                  <div className="bid-score">
                    <ScoreRing score={bid.score} />
                    <StatusBadge value={bid.eligibility} />
                    <span className="score-confidence">
                      신뢰도 {bid.scoreConfidence ?? 0}%
                    </span>
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

          {searched && totalPages > 1 && (
            <nav className="pagination" aria-label="검색결과 페이지">
              <button
                type="button"
                className="pagination-direction"
                disabled={currentPage === 1}
                onClick={() => runSearchNow(currentSearchSnapshot(), currentPage - 1)}
              >
                이전
              </button>
              {pageWindowStart > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => runSearchNow(currentSearchSnapshot(), 1)}
                  >
                    1
                  </button>
                  {pageWindowStart > 2 && <span aria-hidden="true">…</span>}
                </>
              )}
              {pageNumbers.map((page) => (
                <button
                  type="button"
                  key={page}
                  className={page === currentPage ? "active" : ""}
                  aria-current={page === currentPage ? "page" : undefined}
                  onClick={() => runSearchNow(currentSearchSnapshot(), page)}
                >
                  {page}
                </button>
              ))}
              {pageWindowEnd < totalPages && (
                <>
                  {pageWindowEnd < totalPages - 1 && <span aria-hidden="true">…</span>}
                  <button
                    type="button"
                    onClick={() => runSearchNow(currentSearchSnapshot(), totalPages)}
                  >
                    {totalPages}
                  </button>
                </>
              )}
              <button
                type="button"
                className="pagination-direction"
                disabled={currentPage === totalPages}
                onClick={() => runSearchNow(currentSearchSnapshot(), currentPage + 1)}
              >
                다음
              </button>
            </nav>
          )}

          <div className="result-list-end" ref={resultBottomRef} aria-hidden="true" />

          {searched && filteredBids.length > 0 && (
            <div className="result-scroll-controls" aria-label="공고 목록 빠른 이동">
              <button
                type="button"
                onClick={() => scrollToResultBoundary("top")}
                aria-label="공고 목록 상단으로 이동"
                title="공고 목록 상단으로 이동"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => scrollToResultBoundary("bottom")}
                aria-label="공고 목록 하단으로 이동"
                title="공고 목록 하단으로 이동"
              >
                ↓
              </button>
            </div>
          )}

          <div className="source-note">
            <span>ⓘ</span>
            {searchError || "외부 입찰공고 데이터베이스의 실시간 검색결과입니다."}
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
                <span className="score-confidence">
                  점수 신뢰도 {selected.scoreConfidence ?? 0}%
                </span>
              </div>
            </div>

            <div className="ai-brief">
              <div>
                <span>✦</span>
                <strong>AI 핵심 분석</strong>
              </div>
              <p>{selected.summary}</p>
              {(selected.scoreReasons ?? []).map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
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

            <section className="analysis-section score-analysis">
              <h3>
                <span className="dot good" />
                적합도 산정 근거
              </h3>
              <div className="score-breakdown">
                {Object.entries(selected.scoreBreakdown ?? {}).map(([name, value]) => (
                  <div key={name}>
                    <span>{name}</span>
                    <strong>{value}점</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="analysis-section">
              <h3>
                <span className="dot good" />
                일치하는 기업 역량
              </h3>
              <ul>
                {selected.matched.length > 0
                  ? selected.matched.map((item) => (
                      <li key={item}>✓ {item}</li>
                    ))
                  : <li>일치 항목을 추가로 확인해 주세요.</li>}
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
                {selected.risks.length > 0
                  ? selected.risks.map((item) => (
                      <li key={item}>! {item}</li>
                    ))
                  : <li>현재 확인된 추가 위험사항이 없습니다.</li>}
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

      {/* ── Saved Search Modal ── */}
      {saveSearchOpen && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={() => setSaveSearchOpen(false)}
        >
          <section
            className="saved-search-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="saved-search-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setSaveSearchOpen(false)}
              aria-label="검색조건 저장 창 닫기"
            >
              ×
            </button>

            <span className="section-kicker">SAVED SEARCH</span>
            <h2 id="saved-search-title">검색조건 저장</h2>
            <p>현재 조건에 이름을 붙여 저장하고 필요할 때 다시 적용할 수 있습니다.</p>

            <form className="saved-search-form" onSubmit={saveCurrentSearch}>
              <label htmlFor="saved-search-name">검색조건 이름</label>
              <input
                id="saved-search-name"
                value={savedSearchName}
                onChange={(event) => setSavedSearchName(event.target.value)}
                maxLength={50}
                autoFocus
                placeholder="예: 수도권 AI 구축사업"
              />
              <div className="saved-search-summary" aria-label="현재 검색조건 요약">
                <span>{category}</span>
                <span>{region}</span>
                <span>{budgetOptions.find((option) => option.value === maxBudget)?.label || "금액 전체"}</span>
                {includeKeyword && <span>포함: {includeKeyword}</span>}
                {excludeKeyword && <span className="exclude">제외: {excludeKeyword}</span>}
                {onlyEligible && <span>참가 가능만</span>}
                {closingSoon && <span>7일 내 마감</span>}
              </div>
              <button className="primary-action saved-search-submit" type="submit">
                현재 조건 저장
              </button>
            </form>

            <div className="saved-search-list-head">
              <h3>저장한 검색조건</h3>
              <span>{savedSearches.length}개</span>
            </div>
            {savedSearches.length === 0 ? (
              <div className="saved-search-empty">
                아직 저장한 검색조건이 없습니다.
              </div>
            ) : (
              <div className="saved-search-list">
                {savedSearches.map((savedSearch) => (
                  <article className="saved-search-item" key={savedSearch.id}>
                    <div>
                      <strong>{savedSearch.name}</strong>
                      <small>
                        {savedSearch.filters.category} · {savedSearch.filters.region} · {budgetOptions.find((option) => option.value === savedSearch.filters.maxBudget)?.label || "금액 전체"}
                      </small>
                    </div>
                    <div>
                      <button type="button" onClick={() => applySavedSearch(savedSearch)}>
                        적용
                      </button>
                      <button
                        className="delete"
                        type="button"
                        onClick={() => deleteSavedSearch(savedSearch.id)}
                        aria-label={`${savedSearch.name} 삭제`}
                      >
                        삭제
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
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

      {saveNotice && (
        <div className="save-notice" role="status" aria-live="polite">
          ✓ {saveNotice}
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
