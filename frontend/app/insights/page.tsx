"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  companyProfile as DEFAULT_COMPANY_PROFILE,
  type Bid,
  type CompanyProfile,
} from "../../lib/bids";

const COMPANY_PROFILE_KEY = "findbid.company-profile.v1";
const INSIGHT_PAGE_SIZE = 200;
const INSIGHT_TARGET_SIZE = 1_000;
const INSIGHT_IGNORED_TERMS = new Set(["공고", "사업", "용역", "물품", "공사", "기타"]);

type InsightSearchResponse = {
  databaseTotal: number;
  total: number;
  eligibleTotal: number;
  closingSoonTotal: number;
  averageScore: number;
  items: Bid[];
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
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [searchData, setSearchData] = useState<InsightSearchResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedCount, setLoadedCount] = useState(0);
  const [targetCount, setTargetCount] = useState(INSIGHT_TARGET_SIZE);
  const insightRequestIdRef = useRef(0);

  const loadInsights = useCallback(async (profile: CompanyProfile) => {
    const requestId = insightRequestIdRef.current + 1;
    insightRequestIdRef.current = requestId;
    setLoading(true);
    setError("");
    setLoadedCount(0);
    setTargetCount(INSIGHT_TARGET_SIZE);
    setSearchData(EMPTY_RESPONSE);
    const uniqueBids = new Map<string, Bid>();
    let aggregateData: InsightSearchResponse | null = null;
    let partialFailure = false;

    try {
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

      if (partialFailure && requestId === insightRequestIdRef.current) {
        setError(
          `일부 데이터를 불러오지 못해 최신 ${uniqueBids.size.toLocaleString("ko-KR")}건으로 분석했습니다.`,
        );
      }
    } catch {
      if (requestId !== insightRequestIdRef.current) return;
      setSearchData(EMPTY_RESPONSE);
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
    const missedCandidates = [...searchData.items]
      .filter((bid) =>
        bid.eligibility !== "참가 가능"
        && (bid.score >= 65 || (bid.unresolvedRequirements ?? []).length > 0),
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);

    return {
      sampleSize: searchData.items.length,
      opportunityRate,
      reviewNeededTotal: Math.max(searchData.total - searchData.eligibleTotal, 0),
      demands,
      coveredDemandCount: demands.filter((demand) => demand.covered).length,
      categoryBreakdown,
      regionBreakdown,
      contractBreakdown,
      averageBudget,
      missedCandidates,
    };
  }, [companyProfile, searchData]);

  return (
    <main className={`app-shell insights-page ${theme}`}>
      <header className="topbar">
        <a className="logo" href="/" aria-label="FindBid 입찰탐색으로 이동">
          <span className="logo-symbol" aria-hidden="true">
            <img src="/findbid-b-icon.png" alt="" />
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
          <a href="/#alerts">
            <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
            알림
          </a>
        </nav>

        <div className="top-actions">
          <div className="connection-state" aria-label="검색 서비스 연결됨">
            <span />
            <small>연결됨</small>
          </div>
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

            <article className="insight-panel missed-insight">
              <div className="insight-panel-head">
                <span className="insight-panel-icon missed" aria-hidden="true">!</span>
                <div>
                  <h3>놓치고 있는 공고 분석</h3>
                  <p>높은 적합도와 미확인 자격을 우선 탐지</p>
                </div>
              </div>
              <div className="missed-summary">
                <div>
                  <strong>{insightData.reviewNeededTotal.toLocaleString("ko-KR")}<em>건</em></strong>
                  <span>참가 가능 외 검토 대상</span>
                </div>
                <div>
                  <strong>{insightData.missedCandidates.length.toLocaleString("ko-KR")}<em>건</em></strong>
                  <span>표본 내 우선 확인</span>
                </div>
              </div>
              {insightData.missedCandidates.length > 0 ? (
                <ul className="missed-list">
                  {insightData.missedCandidates.map((bid) => {
                    const reason = (bid.unresolvedRequirements ?? [])[0]
                      ?? bid.risks[0]
                      ?? "참가자격 추가 확인 필요";
                    return (
                      <li key={bid.id}>
                        <a
                          href={bid.sourceUrl || "/#search"}
                          target={bid.sourceUrl ? "_blank" : undefined}
                          rel={bid.sourceUrl ? "noopener noreferrer" : undefined}
                        >
                          <span>
                            <strong>{bid.title}</strong>
                            <small>{bid.score}점 · {reason}</small>
                          </span>
                          <em>{bid.sourceUrl ? "원문 보기 ↗" : "탐색하기 →"}</em>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="insight-empty">별도로 확인할 고적합 누락 후보가 없습니다.</p>
              )}
            </article>
          </div>
        </div>
      </section>

      <nav className="mobile-dock insights-mobile-dock" aria-label="모바일 주요 메뉴">
        <a href="/#search">
          <span aria-hidden="true">⌕</span>
          <small>탐색</small>
        </a>
        <a className="active" href="/insights" aria-current="page">
          <span aria-hidden="true">↗</span>
          <small>인사이트</small>
        </a>
      </nav>
    </main>
  );
}
