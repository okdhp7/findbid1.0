"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  companyProfile as DEFAULT_COMPANY_PROFILE,
  type Bid,
  type CompanyProfile,
} from "../../lib/bids";
import { SiteFooter } from "../_components/site-footer";
import { NotificationPopup } from "../_components/notification-popup";
import { useSharedTheme } from "../_components/use-shared-theme";

const COMPANY_PROFILE_KEY = "findbid.company-profile.v1";
const INSIGHT_PAGE_SIZE = 200;
const INSIGHT_TARGET_SIZE = 1_000;
const INSIGHT_IGNORED_TERMS = new Set(["공고", "사업", "용역", "물품", "공사", "기타"]);
const HOT_KEYWORD_IGNORED_TERMS = new Set([
  "공고",
  "입찰",
  "입찰공고",
  "사업",
  "용역",
  "물품",
  "공사",
  "계약",
  "업체",
  "제출",
  "안내",
  "관련",
  "과업",
  "전자입찰",
  "견적",
  "견적제출",
  "소액수의",
  "제안서",
  "나라장터",
  "조달청",
  "선정",
  "연간",
  "단가",
  "학년도",
  "학기",
  "연도",
  "년도",
  "금년도",
  "차년도",
  "상반기",
  "하반기",
  "분기",
  "회차",
  "차수",
  "구매",
  "구입",
  "도입",
  "운영",
  "단계",
  "추진",
  "시행",
  "진행",
  "계획",
  "지원",
  "관리",
  "제작",
  "설치",
  "구축",
  "개선",
  "보수",
  "정비",
  "교체",
  "업무",
  "수행",
  "실시",
  "제공",
  "발주",
  "모집",
  "요청",
  "공급",
  "납품",
  "대행",
  "위탁",
  "긴급",
  "재공고",
  "변경",
  "취소",
  "신규",
  "대상",
  "일체",
  "위한",
  "대한",
  "따른",
  "통한",
  "관한",
  "해당",
  "포함",
  "예정",
  "전국",
  "지역",
  "자격",
  "면허",
  "인증",
  "사업자",
  "예산",
  "금액",
  "시스템",
  "운영관리",
  "관리운영",
  "운영지원",
  "구매설치",
  "구매납품",
  "도입운영",
  "구축운영",
]);
const HOT_KEYWORD_ALIASES = new Map([
  ["ai", "인공지능"],
  ["a.i", "인공지능"],
  ["인공지능", "인공지능"],
  ["홈페이지", "홈페이지"],
  ["웹사이트", "홈페이지"],
  ["유지보수", "유지관리"],
  ["유지관리", "유지관리"],
]);
const HOT_KEYWORD_DIMENSIONS = [
  { value: "all", label: "전체" },
  { value: "category", label: "업무구분별" },
  { value: "region", label: "지역별" },
  { value: "budget", label: "금액대별" },
] as const;
const HOT_KEYWORD_BUDGET_BANDS = [
  { value: "under-1", label: "1억원 미만", min: 1, max: 100_000_000 },
  { value: "1-5", label: "1억원 이상~5억원 미만", min: 100_000_000, max: 500_000_000 },
  { value: "5-10", label: "5억원 이상~10억원 미만", min: 500_000_000, max: 1_000_000_000 },
  { value: "10-50", label: "10억원 이상~50억원 미만", min: 1_000_000_000, max: 5_000_000_000 },
  { value: "over-50", label: "50억원 이상", min: 5_000_000_000, max: Number.POSITIVE_INFINITY },
  { value: "unknown", label: "금액 미정", min: 0, max: 1 },
] as const;
const PARTICIPATION_RESTRICTION_RULES = [
  {
    label: "지역 제한 불충족",
    terms: ["지역제한", "지역 제한", "소재", "관내", "지역업체", "본점"],
  },
  {
    label: "사업금액 범위 초과",
    terms: ["금액", "예산", "사업비", "추정가격", "기초금액"],
  },
  {
    label: "자격·면허 부족",
    terms: ["면허", "자격", "직접생산", "업종", "사업자", "신고", "인증", "확인서"],
  },
  {
    label: "실적 확인 필요",
    terms: ["실적", "경력", "수행 경험"],
  },
  {
    label: "계약조건 확인 필요",
    terms: ["계약", "상주", "인력", "납품", "공급", "공동수급", "보증"],
  },
] as const;

type InsightSearchResponse = {
  databaseTotal: number;
  total: number;
  eligibleTotal: number;
  closingSoonTotal: number;
  averageScore: number;
  items: Bid[];
};

type HotKeywordDimension = typeof HOT_KEYWORD_DIMENSIONS[number]["value"];

type HotKeywordResult = {
  label: string;
  count: number;
  share: number;
  heat: number;
  change: number | null;
  isNew: boolean;
};

const EMPTY_RESPONSE: InsightSearchResponse = {
  databaseTotal: 0,
  total: 0,
  eligibleTotal: 0,
  closingSoonTotal: 0,
  averageScore: 0,
  items: [],
};

function normalizeInsightTerm(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-z가-힣+#]+/g, "");
}

function rankedInsightValues(values: string[], limit = 5) {
  const counts = new Map<string, number>();
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko"))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function formatInsightBudget(value: number): string {
  if (value <= 0) return "금액 정보 없음";
  const hundredMillion = value / 100_000_000;
  if (hundredMillion >= 1) {
    return `${hundredMillion.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억원`;
  }
  return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
}

function hotKeywordTerms(title: string): string[] {
  const tokens = title.toLowerCase().match(/[a-z][a-z0-9+#.-]{1,}|[가-힣]{2,}/g) ?? [];
  return [...new Set(tokens
    .map((token) => token.replace(/^[.-]+|[.-]+$/g, ""))
    .map((token) => HOT_KEYWORD_ALIASES.get(token) ?? token)
    .filter((token) => token.length >= 2 && !HOT_KEYWORD_IGNORED_TERMS.has(token)))];
}

function hotKeywordResults(items: Bid[], limit = 10): HotKeywordResult[] {
  if (items.length === 0) return [];
  const midpoint = Math.max(1, Math.ceil(items.length / 2));
  const recentSize = midpoint;
  const previousSize = Math.max(1, items.length - midpoint);
  const counts = new Map<string, { count: number; recent: number; previous: number; heat: number }>();

  items.forEach((bid, index) => {
    const recencyWeight = 1 + ((items.length - index) / items.length) * 0.45;
    hotKeywordTerms(bid.title).forEach((keyword) => {
      const current = counts.get(keyword) ?? { count: 0, recent: 0, previous: 0, heat: 0 };
      current.count += 1;
      current.heat += recencyWeight;
      if (index < midpoint) current.recent += 1;
      else current.previous += 1;
      counts.set(keyword, current);
    });
  });

  const minimumCount = items.length >= 100 ? 3 : items.length >= 30 ? 2 : 1;
  return [...counts.entries()]
    .filter(([, value]) => value.count >= minimumCount)
    .map(([label, value]) => {
      const recentRate = value.recent / recentSize;
      const previousRate = value.previous / previousSize;
      return {
        label,
        count: value.count,
        share: Math.round((value.count / items.length) * 1_000) / 10,
        heat: value.heat,
        change: value.previous > 0
          ? Math.round(((recentRate - previousRate) / previousRate) * 100)
          : null,
        isNew: value.previous === 0 && value.recent > 0,
      };
    })
    .sort((left, right) => right.heat - left.heat || right.count - left.count
      || left.label.localeCompare(right.label, "ko"))
    .slice(0, limit);
}

function hotKeywordBudgetBand(budget: number): string {
  if (!Number.isFinite(budget) || budget <= 0) return "unknown";
  return HOT_KEYWORD_BUDGET_BANDS.find((band) => budget >= band.min && budget < band.max)?.value
    ?? "unknown";
}

function participationRestrictionLabel(bid: Bid): string {
  const reasonText = [
    ...(bid.unresolvedRequirements ?? []),
    ...bid.risks,
  ].join(" ").toLowerCase();
  return PARTICIPATION_RESTRICTION_RULES.find((rule) =>
    rule.terms.some((term) => reasonText.includes(term)))?.label
    ?? "기타 조건 확인";
}

function restoreCompanyProfile(): CompanyProfile {
  if (typeof window === "undefined") return DEFAULT_COMPANY_PROFILE;
  try {
    const stored = window.localStorage.getItem(COMPANY_PROFILE_KEY);
    if (!stored) return DEFAULT_COMPANY_PROFILE;
    const parsed = JSON.parse(stored) as Partial<CompanyProfile>;
    return {
      ...DEFAULT_COMPANY_PROFILE,
      ...parsed,
      licenses: Array.isArray(parsed.licenses) ? parsed.licenses : DEFAULT_COMPANY_PROFILE.licenses,
      technologies: Array.isArray(parsed.technologies)
        ? parsed.technologies
        : DEFAULT_COMPANY_PROFILE.technologies,
      businessAreas: Array.isArray(parsed.businessAreas)
        ? parsed.businessAreas
        : DEFAULT_COMPANY_PROFILE.businessAreas,
      experiences: Array.isArray(parsed.experiences)
        ? parsed.experiences
        : DEFAULT_COMPANY_PROFILE.experiences,
    };
  } catch {
    return DEFAULT_COMPANY_PROFILE;
  }
}

export default function InsightsPage() {
  const { theme, toggleTheme } = useSharedTheme();
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [searchData, setSearchData] = useState<InsightSearchResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedCount, setLoadedCount] = useState(0);
  const [targetCount, setTargetCount] = useState(INSIGHT_TARGET_SIZE);
  const [priorityOpportunities, setPriorityOpportunities] = useState<Bid[]>([]);
  const [restrictionBids, setRestrictionBids] = useState<Bid[]>([]);
  const [hotKeywordDimension, setHotKeywordDimension] = useState<HotKeywordDimension>("all");
  const [hotKeywordGroup, setHotKeywordGroup] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const insightRequestIdRef = useRef(0);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);

  const loadInsights = useCallback(async (profile: CompanyProfile) => {
    const requestId = insightRequestIdRef.current + 1;
    insightRequestIdRef.current = requestId;
    setLoading(true);
    setError("");
    setLoadedCount(0);
    setTargetCount(INSIGHT_TARGET_SIZE);
    setSearchData(EMPTY_RESPONSE);
    setPriorityOpportunities([]);
    setRestrictionBids([]);
    const uniqueBids = new Map<string, Bid>();
    let aggregateData: InsightSearchResponse | null = null;
    let partialFailure = false;

    try {
      const priorityRequest = fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          category: "전체",
          region: "전체 지역",
          maxBudget: 0,
          includeKeywords: [],
          excludeKeywords: [],
          onlyEligible: true,
          closingWithinDays: 14,
          sortMode: "opportunity",
          semanticQuery: "",
          companyProfile: profile,
          page: 1,
          limit: 3,
        }),
      }).then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json() as InsightSearchResponse;
        return Array.isArray(data.items) ? data.items.slice(0, 3) : null;
      }).catch(() => null);

      const restrictionRequest = (async () => {
        const restrictionItems = new Map<string, Bid>();
        const maximumRestrictionPages = Math.ceil(INSIGHT_TARGET_SIZE / INSIGHT_PAGE_SIZE);
        for (let page = 1; page <= maximumRestrictionPages; page += 1) {
          const response = await fetch("/api/search", {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              category: "전체",
              region: "전체 지역",
              maxBudget: 0,
              includeKeywords: [],
              excludeKeywords: [],
              onlyEligible: false,
              eligibilityMode: "not_eligible",
              closingWithinDays: null,
              sortMode: "latest",
              semanticQuery: "",
              companyProfile: profile,
              page,
              limit: INSIGHT_PAGE_SIZE,
            }),
          });
          if (!response.ok) return null;
          const data = await response.json() as InsightSearchResponse;
          if (!Array.isArray(data.items) || typeof data.total !== "number") return null;
          data.items.forEach((bid) => restrictionItems.set(bid.id, bid));
          const desiredCount = Math.min(data.total, INSIGHT_TARGET_SIZE);
          if (restrictionItems.size >= desiredCount || data.items.length < INSIGHT_PAGE_SIZE) {
            return [...restrictionItems.values()].slice(0, desiredCount);
          }
        }
        return [...restrictionItems.values()].slice(0, INSIGHT_TARGET_SIZE);
      })().catch(() => null);

      const maximumPages = Math.ceil(INSIGHT_TARGET_SIZE / INSIGHT_PAGE_SIZE);
      for (let page = 1; page <= maximumPages; page += 1) {
        let data: InsightSearchResponse;
        try {
          const response = await fetch("/api/search", {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              category: "전체",
              region: "전체 지역",
              maxBudget: 0,
              includeKeywords: [],
              excludeKeywords: [],
              onlyEligible: false,
              closingWithinDays: null,
              sortMode: "latest",
              semanticQuery: "",
              companyProfile: profile,
              page,
              limit: INSIGHT_PAGE_SIZE,
            }),
          });
          if (!response.ok) throw new Error("인사이트 검색 응답 오류");
          data = await response.json() as InsightSearchResponse;
          if (
            !Array.isArray(data.items)
            || typeof data.total !== "number"
            || typeof data.eligibleTotal !== "number"
          ) {
            throw new Error("인사이트 데이터 형식 오류");
          }
        } catch {
          if (uniqueBids.size === 0) throw new Error("첫 인사이트 조회 실패");
          partialFailure = true;
          break;
        }

        if (requestId !== insightRequestIdRef.current) return;
        aggregateData ??= data;
        data.items.forEach((bid) => uniqueBids.set(bid.id, bid));
        const desiredCount = Math.min(data.total, INSIGHT_TARGET_SIZE);
        const items = [...uniqueBids.values()].slice(0, desiredCount);
        setTargetCount(desiredCount);
        setLoadedCount(items.length);
        setSearchData({
          ...aggregateData,
          items,
        });

        if (items.length >= desiredCount || data.items.length < INSIGHT_PAGE_SIZE) {
          break;
        }
      }

      const [loadedPriorityOpportunities, loadedRestrictionBids] = await Promise.all([
        priorityRequest,
        restrictionRequest,
      ]);
      if (requestId !== insightRequestIdRef.current) return;
      if (loadedPriorityOpportunities) {
        setPriorityOpportunities(loadedPriorityOpportunities);
      } else {
        partialFailure = true;
      }
      if (loadedRestrictionBids) {
        setRestrictionBids(loadedRestrictionBids);
      } else {
        partialFailure = true;
      }

      if (partialFailure && requestId === insightRequestIdRef.current) {
        setError(
          `일부 분석 데이터를 불러오지 못해 확인된 ${uniqueBids.size.toLocaleString("ko-KR")}건으로 표시했습니다.`,
        );
      }
    } catch {
      if (requestId !== insightRequestIdRef.current) return;
      setSearchData(EMPTY_RESPONSE);
      setPriorityOpportunities([]);
      setRestrictionBids([]);
      setError("인사이트 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      if (requestId === insightRequestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const restoredProfile = restoreCompanyProfile();
    setCompanyProfile(restoredProfile);
    void loadInsights(restoredProfile);
  }, [loadInsights]);

  const insightData = useMemo(() => {
    const capabilityValues = [
      ...companyProfile.licenses,
      ...companyProfile.technologies,
      ...companyProfile.businessAreas,
      ...companyProfile.experiences,
    ].filter(Boolean);
    const normalizedCapabilities = capabilityValues
      .map(normalizeInsightTerm)
      .filter((value) => value.length >= 2);
    const demandValues = searchData.items.flatMap((bid) => [
      ...bid.tags,
      ...bid.requirements,
    ]).filter((value) => {
      const normalized = normalizeInsightTerm(value);
      return normalized.length >= 2 && !INSIGHT_IGNORED_TERMS.has(normalized);
    });
    const demands = rankedInsightValues(demandValues, 8).map((demand) => {
      const normalizedDemand = normalizeInsightTerm(demand.label);
      const covered = normalizedCapabilities.some((capability) =>
        normalizedDemand.includes(capability) || capability.includes(normalizedDemand),
      );
      return { ...demand, covered };
    });
    const categoryBreakdown = rankedInsightValues(
      searchData.items.map((bid) => bid.category),
      3,
    );
    const regionBreakdown = rankedInsightValues(
      searchData.items.map((bid) => bid.region || "전국"),
      5,
    );
    const contractBreakdown = rankedInsightValues(
      searchData.items.map((bid) => bid.contractMethod || "미분류"),
      5,
    );
    const budgetValues = searchData.items
      .map((bid) => bid.budget)
      .filter((budget) => Number.isFinite(budget) && budget > 0);
    const averageBudget = budgetValues.length > 0
      ? budgetValues.reduce((sum, budget) => sum + budget, 0) / budgetValues.length
      : 0;
    const opportunityRate = searchData.total > 0
      ? Math.round((searchData.eligibleTotal / searchData.total) * 100)
      : 0;
    const restrictionBreakdown = rankedInsightValues(
      restrictionBids.map(participationRestrictionLabel),
      6,
    );
    const recoverableCount = restrictionBids.filter((bid) =>
      bid.eligibility === "확인 필요"
      && (bid.score >= 65 || (bid.unresolvedRequirements ?? []).length > 0),
    ).length;
    return {
      sampleSize: searchData.items.length,
      opportunityRate,
      demands,
      coveredDemandCount: demands.filter((demand) => demand.covered).length,
      categoryBreakdown,
      regionBreakdown,
      contractBreakdown,
      averageBudget,
      restrictedTotal: restrictionBids.length,
      restrictionBreakdown,
      recoverableCount,
    };
  }, [companyProfile, restrictionBids, searchData]);

  const hotKeywordGroups = useMemo(() => {
    if (hotKeywordDimension === "category") {
      const categoryOrder = ["용역", "물품", "공사"];
      const available = new Set(searchData.items.map((bid) => bid.category));
      return categoryOrder
        .filter((category) => available.has(category as Bid["category"]))
        .map((category) => ({ value: category, label: category }));
    }
    if (hotKeywordDimension === "region") {
      return rankedInsightValues(
        searchData.items.map((bid) => bid.region || "전국"),
        17,
      ).map((region) => ({ value: region.label, label: `${region.label} (${region.count}건)` }));
    }
    if (hotKeywordDimension === "budget") {
      return HOT_KEYWORD_BUDGET_BANDS.map((band) => ({ value: band.value, label: band.label }));
    }
    return [{ value: "all", label: "전체 표본" }];
  }, [hotKeywordDimension, searchData.items]);

  const activeHotKeywordGroup = hotKeywordGroups.some((group) => group.value === hotKeywordGroup)
    ? hotKeywordGroup
    : hotKeywordGroups[0]?.value ?? "";

  const hotKeywordAnalysis = useMemo(() => {
    const scopedItems = searchData.items.filter((bid) => {
      if (hotKeywordDimension === "category") return bid.category === activeHotKeywordGroup;
      if (hotKeywordDimension === "region") return (bid.region || "전국") === activeHotKeywordGroup;
      if (hotKeywordDimension === "budget") return hotKeywordBudgetBand(bid.budget) === activeHotKeywordGroup;
      return true;
    });
    return {
      sampleSize: scopedItems.length,
      keywords: hotKeywordResults(scopedItems),
    };
  }, [activeHotKeywordGroup, hotKeywordDimension, searchData.items]);

  return (
    <main className={`app-shell insights-page ${theme}`}>
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
          <a href="/#search">
            <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="5.5" />
              <path d="m15 15 4.5 4.5" />
            </svg>
            입찰 탐색
          </a>
          <a className="active" href="/insights" aria-current="page">
            <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 19V11M12 19V5M19 19v-8" />
              <path d="m4 8 5-4 4 4 6-5" />
            </svg>
            인사이트
          </a>
          <button type="button" onClick={() => setNotificationsOpen(true)} aria-haspopup="dialog">
            <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
            알림
          </button>
        </nav>

        <div className="top-actions">
          <div className="connection-state" aria-label="검색 서비스 연결됨">
            <span />
            <small>연결됨</small>
          </div>
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

      <section className="insights-hero">
        <div>
          <span className="section-kicker">BID INTELLIGENCE</span>
          <h1>입찰 인사이트</h1>
          <p>시장 수요와 기업 역량을 함께 분석해 다음 참여 기회를 한눈에 보여드립니다.</p>
        </div>
        <button
          type="button"
          className="insights-refresh"
          disabled={loading}
          onClick={() => void loadInsights(companyProfile)}
        >
          {loading
            ? `분석 중 ${loadedCount.toLocaleString("ko-KR")}/${targetCount.toLocaleString("ko-KR")}`
            : "분석 새로고침"}
        </button>
      </section>

      <section className="insights-main" aria-live="polite">
        {error && <div className="insights-error" role="alert">{error}</div>}
        <div className="insight-dashboard standalone">
          <div className="insight-dashboard-head">
            <div>
              <span className="section-kicker">MARKET SNAPSHOT</span>
              <h2>기업 맞춤 입찰 분석</h2>
              <p>{companyProfile.name} 프로필과 최신 입찰공고를 비교했습니다.</p>
            </div>
            <span className="insight-sample">
              {loading
                ? `${targetCount.toLocaleString("ko-KR")}건 중 ${loadedCount.toLocaleString("ko-KR")}건 분석 중`
                : `최신 ${insightData.sampleSize.toLocaleString("ko-KR")}건 표본`}
            </span>
          </div>

          <div className="insight-grid">
            <article className="insight-panel opportunity-insight">
              <div className="insight-panel-head">
                <span className="insight-panel-icon opportunity" aria-hidden="true">◎</span>
                <div>
                  <h3>참여 기회 요약</h3>
                  <p>전체 검색 결과 기준</p>
                </div>
              </div>
              <div className="opportunity-summary">
                <div>
                  <span>전체 공고</span>
                  <strong>{searchData.databaseTotal.toLocaleString("ko-KR")}<em>건</em></strong>
                </div>
                <div>
                  <span>참가 가능</span>
                  <strong>{searchData.eligibleTotal.toLocaleString("ko-KR")}<em>건</em></strong>
                </div>
                <div>
                  <span>참여 가능 비율</span>
                  <strong>{insightData.opportunityRate.toLocaleString("ko-KR")}<em>%</em></strong>
                </div>
                <div>
                  <span>7일 내 마감</span>
                  <strong>{searchData.closingSoonTotal.toLocaleString("ko-KR")}<em>건</em></strong>
                </div>
              </div>
              <div className="insight-callout">
                <span>평균 적합도</span>
                <strong>{searchData.averageScore.toLocaleString("ko-KR")}점</strong>
                <p>
                  {searchData.closingSoonTotal > 0
                    ? `마감이 가까운 ${searchData.closingSoonTotal.toLocaleString("ko-KR")}건부터 검토해 보세요.`
                    : "현재 7일 이내 마감 공고는 없습니다."}
                </p>
              </div>
              <div className="priority-opportunities">
                <div className="priority-opportunities-head">
                  <div>
                    <strong>지금 검토할 공고</strong>
                    <span>참가 가능 · 14일 내 마감 우선</span>
                  </div>
                  <Link href="/?source=insights#search">
                    전체 보기 <span aria-hidden="true">→</span>
                  </Link>
                </div>
                {priorityOpportunities.length > 0 ? (
                  <ol className="priority-opportunity-list">
                    {priorityOpportunities.map((bid) => (
                      <li key={bid.id}>
                        <span className="priority-opportunity-rank" aria-hidden="true" />
                        <a
                          href={bid.sourceUrl || "/#search"}
                          target={bid.sourceUrl ? "_blank" : undefined}
                          rel={bid.sourceUrl ? "noopener noreferrer" : undefined}
                        >
                          {bid.title}
                        </a>
                        <div>
                          <strong>{bid.daysLeft === 0 ? "오늘 마감" : `D-${bid.daysLeft}`}</strong>
                          <span>적합도 {bid.score.toLocaleString("ko-KR")}점</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="priority-opportunities-empty">
                    현재 우선 검토할 참가 가능 공고가 없습니다.
                  </p>
                )}
              </div>
            </article>

            <article className="insight-panel capability-insight">
              <div className="insight-panel-head">
                <span className="insight-panel-icon capability" aria-hidden="true">◇</span>
                <div>
                  <h3>기업 역량과 시장 수요 비교</h3>
                  <p>최신 표본의 자격·분류 항목 기준</p>
                </div>
              </div>
              {insightData.demands.length > 0 ? (
                <>
                  <div className="capability-score">
                    <div>
                      <strong>
                        {insightData.coveredDemandCount}
                        <em> / {insightData.demands.length}</em>
                      </strong>
                      <span>상위 수요 역량 보유</span>
                    </div>
                    <div
                      className="capability-meter"
                      role="img"
                      aria-label={`상위 수요 ${insightData.demands.length}개 중 ${insightData.coveredDemandCount}개 보유`}
                    >
                      <span
                        style={{
                          width: `${Math.round(
                            (insightData.coveredDemandCount / insightData.demands.length) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                  <ul className="demand-list">
                    {insightData.demands.map((demand) => (
                      <li key={demand.label}>
                        <span>{demand.label}</span>
                        <small>{demand.count}건</small>
                        <em className={demand.covered ? "covered" : "gap"}>
                          {demand.covered ? "보유" : "보완 필요"}
                        </em>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="insight-empty">비교할 자격·역량 항목이 아직 없습니다.</p>
              )}
            </article>

            <article className="insight-panel market-insight">
              <div className="insight-panel-head">
                <span className="insight-panel-icon market" aria-hidden="true">↗</span>
                <div>
                  <h3>입찰시장 동향</h3>
                  <p>최신 {insightData.sampleSize.toLocaleString("ko-KR")}건 표본 기준</p>
                </div>
              </div>
              <div className="market-summary">
                <div>
                  <span>평균 사업금액</span>
                  <strong>{formatInsightBudget(insightData.averageBudget)}</strong>
                </div>
                <div>
                  <span>주요 지역</span>
                  <strong>{insightData.regionBreakdown[0]?.label ?? "분석 대기"}</strong>
                </div>
                <div>
                  <span>주요 계약방법</span>
                  <strong>{insightData.contractBreakdown[0]?.label ?? "분석 대기"}</strong>
                </div>
              </div>
              <div className="market-bars" aria-label="업무 구분별 공고 비중">
                {insightData.categoryBreakdown.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <div>
                      <i
                        style={{
                          width: `${insightData.sampleSize > 0
                            ? Math.round((item.count / insightData.sampleSize) * 100)
                            : 0}%`,
                        }}
                      />
                    </div>
                    <strong>{item.count}건</strong>
                  </div>
                ))}
              </div>
              {insightData.regionBreakdown.length > 0 && (
                <p className="market-footnote">
                  지역 상위: {insightData.regionBreakdown
                    .map((item) => `${item.label} ${item.count}건`)
                    .join(" · ")}
                </p>
              )}
            </article>

            <article className="insight-panel restriction-insight">
              <div className="insight-panel-head">
                <span className="insight-panel-icon missed" aria-hidden="true">!</span>
                <div>
                  <h3>참여 제한 요인 분석</h3>
                  <p>참가 가능 외 {insightData.restrictedTotal.toLocaleString("ko-KR")}건 전용 분석</p>
                </div>
              </div>
              <div className="restriction-summary">
                <div>
                  <strong>{insightData.restrictedTotal.toLocaleString("ko-KR")}<em>건</em></strong>
                  <span>표본 내 참여 제한 공고</span>
                </div>
                <div>
                  <strong>{insightData.recoverableCount.toLocaleString("ko-KR")}<em>건</em></strong>
                  <span>보완 가능성이 높은 공고</span>
                </div>
              </div>
              {insightData.restrictionBreakdown.length > 0 ? (
                <ul className="restriction-list">
                  {insightData.restrictionBreakdown.map((reason) => (
                    <li key={reason.label}>
                      <span>{reason.label}</span>
                      <div aria-hidden="true">
                        <i
                          style={{
                            width: `${Math.round(
                              (reason.count / insightData.restrictedTotal) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                      <strong>{reason.count.toLocaleString("ko-KR")}건</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="insight-empty">현재 분석할 참여 제한 요인이 없습니다.</p>
              )}
              <p className="restriction-footnote">공고별 주요 제한 요인 1개를 기준으로 집계했습니다.</p>
            </article>

            <article className="insight-panel hot-keyword-insight">
              <div className="hot-keyword-heading">
                <div className="insight-panel-head">
                  <span className="insight-panel-icon hot-keyword" aria-hidden="true">#</span>
                  <div>
                    <h3>핫 키워드 동향</h3>
                    <p>공고 제목의 출현 빈도와 최신 공고 가중치를 반영한 상위 키워드</p>
                  </div>
                </div>
                <div className="hot-keyword-dimensions" role="tablist" aria-label="핫 키워드 분석 기준">
                  {HOT_KEYWORD_DIMENSIONS.map((dimension) => (
                    <button
                      key={dimension.value}
                      type="button"
                      role="tab"
                      aria-selected={hotKeywordDimension === dimension.value}
                      className={hotKeywordDimension === dimension.value ? "active" : ""}
                      onClick={() => {
                        setHotKeywordDimension(dimension.value);
                        setHotKeywordGroup("");
                      }}
                    >
                      {dimension.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hot-keyword-toolbar">
                <div>
                  <strong>
                    {HOT_KEYWORD_DIMENSIONS.find((dimension) => dimension.value === hotKeywordDimension)?.label}
                  </strong>
                  <span>
                    {hotKeywordAnalysis.sampleSize.toLocaleString("ko-KR")}건 분석 · 상위 {hotKeywordAnalysis.keywords.length}개
                  </span>
                </div>
                {hotKeywordDimension !== "all" && (
                  <label>
                    <span>세부 기준</span>
                    <select
                      aria-label="핫 키워드 세부 기준"
                      value={activeHotKeywordGroup}
                      onChange={(event) => setHotKeywordGroup(event.target.value)}
                    >
                      {hotKeywordGroups.map((group) => (
                        <option key={group.value} value={group.value}>{group.label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {hotKeywordAnalysis.keywords.length > 0 ? (
                <ol className="hot-keyword-chart" aria-label="핫 키워드 순위 차트">
                  {hotKeywordAnalysis.keywords.map((keyword, index) => {
                    const maximumHeat = hotKeywordAnalysis.keywords[0]?.heat || 1;
                    const width = Math.max(4, Math.round((keyword.heat / maximumHeat) * 100));
                    const trendClass = keyword.isNew
                      ? "new"
                      : keyword.change !== null && keyword.change > 0
                        ? "up"
                        : keyword.change !== null && keyword.change < 0
                          ? "down"
                          : "steady";
                    const trendLabel = keyword.isNew
                      ? "신규"
                      : keyword.change === null
                        ? "비교 대기"
                        : keyword.change > 0
                          ? `▲ ${keyword.change.toLocaleString("ko-KR")}%`
                          : keyword.change < 0
                            ? `▼ ${Math.abs(keyword.change).toLocaleString("ko-KR")}%`
                            : "유지";
                    return (
                      <li key={keyword.label}>
                        <span className="hot-keyword-rank">{index + 1}</span>
                        <strong>{keyword.label}</strong>
                        <div
                          className="hot-keyword-bar"
                          role="img"
                          aria-label={`${keyword.label} ${keyword.count}건, 비중 ${keyword.share}%`}
                        >
                          <i style={{ width: `${width}%` }} />
                        </div>
                        <span className="hot-keyword-count">
                          {keyword.count.toLocaleString("ko-KR")}건
                          <small>{keyword.share.toLocaleString("ko-KR")}%</small>
                        </span>
                        <em className={`hot-keyword-trend ${trendClass}`}>{trendLabel}</em>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="insight-empty">선택한 기준에서 분석할 키워드가 충분하지 않습니다.</p>
              )}
              <p className="hot-keyword-footnote">
                동일 키워드는 공고당 1회 집계하며, 변화율은 선택 표본의 최근 절반과 이전 절반을 비교합니다.
              </p>
            </article>
          </div>
        </div>
      </section>

      <SiteFooter />

      <nav className="mobile-dock insights-mobile-dock" aria-label="모바일 주요 메뉴">
        <a href="/#search">
          <span aria-hidden="true">⌕</span>
          <small>탐색</small>
        </a>
        <a className="active" href="/insights" aria-current="page">
          <span aria-hidden="true">↗</span>
          <small>인사이트</small>
        </a>
        <button type="button" onClick={() => setNotificationsOpen(true)} aria-haspopup="dialog">
          <span aria-hidden="true">♢</span>
          <small>알림</small>
        </button>
      </nav>

      <NotificationPopup open={notificationsOpen} onClose={closeNotifications} />
    </main>
  );
}
