import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("FindBid 검색 화면을 서버에서 렌더링한다", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>FindBid \| AI 입찰공고 탐색<\/title>/i);
  assert.match(html, /AI 시맨틱 검색/);
  assert.match(html, /상세 조건/);
  assert.match(html, /실제 입찰공고를 불러오는 중입니다/);
  assert.match(html, /role="status"/);
  assert.match(html, /placeholder="AI, 웹서비스, 플랫폼" value=""/);
  assert.match(html, /placeholder="장비 납품, 인력파견" value=""/);
  assert.doesNotMatch(html, /1,284/);
});

test("페이지 최상단과 공고 목록 하단 이동 기능을 제공한다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /resultBottomRef/);
  assert.match(page, /scrollIntoView/);
  assert.match(page, /window\.scrollTo\(\{[\s\S]*?top:\s*0/);
  assert.match(page, /페이지 최상단으로 이동/);
  assert.match(page, /공고 목록 하단으로 이동/);
  assert.match(page, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.app-shell \.result-scroll-controls/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /top:\s*50%/);
  assert.match(css, /transform:\s*translateY\(-50%\)/);
  assert.match(css, /\.input-with-icon input:hover::placeholder/);
  assert.match(css, /\.input-with-icon input:focus::placeholder/);
  assert.match(css, /\.input-with-icon:focus-within\s*\{[\s\S]*?border-color:\s*transparent/);
  assert.match(css, /\.input-with-icon:focus-within\s*\{[\s\S]*?box-shadow:\s*none/);
  assert.match(css, /\.input-with-icon input:focus-visible\s*\{[\s\S]*?outline:\s*none/);
  assert.match(css, /\.app-shell \.semantic-card\s*\{[\s\S]*?border-radius:\s*var\(--radius-xl\)/);
  assert.match(css, /\.app-shell \.filters\s*\{[\s\S]*?border-radius:\s*var\(--radius-lg\)/);
  assert.match(css, /\.app-shell \.bid-card\s*\{[\s\S]*?border-radius:\s*var\(--radius-lg\)/);
  assert.match(css, /\.app-shell \.metrics article\s*\{[\s\S]*?border-radius:\s*var\(--radius-md\)/);
});

test("입찰탐색과 인사이트 페이지가 선택한 화면 테마를 공유한다", async () => {
  const [page, insights, sharedTheme, layout, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_components/use-shared-theme.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const \{ theme, toggleTheme \} = useSharedTheme\(\)/);
  assert.match(insights, /const \{ theme, toggleTheme \} = useSharedTheme\(\)/);
  assert.equal((page.match(/onClick=\{toggleTheme\}/g) ?? []).length, 1);
  assert.equal((insights.match(/onClick=\{toggleTheme\}/g) ?? []).length, 1);
  assert.match(sharedTheme, /findbid\.color-theme\.v1/);
  assert.match(sharedTheme, /window\.localStorage\.getItem\(THEME_STORAGE_KEY\)/);
  assert.match(sharedTheme, /window\.localStorage\.setItem\(THEME_STORAGE_KEY, nextTheme\)/);
  assert.match(sharedTheme, /document\.documentElement\.dataset\.findbidTheme = theme/);
  assert.match(layout, /themeInitializationScript/);
  assert.match(layout, /document\.documentElement\.dataset\.findbidTheme = storedTheme/);
  assert.match(layout, /<html lang="ko" suppressHydrationWarning>/);
  assert.match(css, /html\[data-findbid-theme="dark"\] body\s*\{[\s\S]*?background:\s*#212121/);
  assert.match(css, /html:not\(\[data-findbid-theme="dark"\]\) \.app-shell\.light,/);
});

test("상세조건 변경 시 시맨틱 검색어를 함께 적용해 자동 검색한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /new AbortController\(\)/);
  assert.match(page, /requestId !== searchRequestIdRef\.current/);
  assert.match(page, /scheduleDetailSearch\(/);
  assert.match(page, /const detailSnapshot = \{ \.\.\.snapshot \}/);
  assert.match(page, /prepareSemanticAnalysisState\(detailSnapshot\.semanticQuery\);[\s\S]*?runSearch\(detailSnapshot, 1\)/);
  const prepareAnalysisBody = page.match(
    /const prepareSemanticAnalysisState = \(nextSemanticQuery: string\) => \{([\s\S]*?)\n  \};/,
  )?.[1] ?? "";
  assert.doesNotMatch(prepareAnalysisBody, /setSemanticQuery\(/);
  assert.match(prepareAnalysisBody, /setSemanticQueryActive\(Boolean\(nextSemanticQuery\.trim\(\)\)\)/);
  assert.match(page, /입력 문장은 아직 검색에 적용되지 않았습니다/);
  assert.doesNotMatch(page, /상세조건 검색에는 적용되지 않았습니다/);
  assert.match(page, /searchRequestIdRef\.current \+= 1;[\s\S]*?searchAbortControllerRef\.current\?\.abort\(\)/);
  assert.match(page, /includeKeyword: nextKeyword[\s\S]*?500/);
  assert.match(page, /excludeKeyword: nextKeyword[\s\S]*?500/);
  assert.match(page, /prepareSemanticAnalysisState\(resetSnapshot\.semanticQuery\)/);
  assert.match(page, /onClick=\{\(\) => \{ runSearchNow\(currentSearchSnapshot\(\)\); setFiltersOpen\(false\); \}\}/);
  assert.match(page, /조건 적용하기/);
  assert.match(page, /\/\*[\s\S]*?조건 적용하기[\s\S]*?\*\//);
  assert.match(
    page,
    /className="reset-button"[\s\S]*?<span aria-hidden="true">×<\/span>[\s\S]*?조건 초기화[\s\S]*?className="apply-button"[\s\S]*?검색조건 저장\/선택/,
  );
  assert.match(
    page,
    /className="semantic-input-clear"[\s\S]*?<span aria-hidden="true">×<\/span>[\s\S]*?입력 지우기/,
  );
  assert.doesNotMatch(page, /className="save-search"/);
});

test("검색 상세조건의 사업금액 초기값은 금액 전체이다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(
    page,
    /const DEFAULT_SEARCH: SearchSnapshot = \{[\s\S]*?maxBudget:\s*0,/,
  );
  assert.match(page, /\{ label: "금액 전체", value: 0 \}/);
  assert.match(page, /const \[maxBudget, setMaxBudget\] = useState\(DEFAULT_SEARCH\.maxBudget\)/);
  assert.match(page, /void runSearch\(DEFAULT_SEARCH\)/);
});

test("인사이트 전체 보기는 전용 조건에서만 14일 이내 참가 가능 공고를 검색한다", async () => {
  const [page, insightsPage] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(insightsPage, /href="\/\?source=insights#search"/);
  assert.match(
    page,
    /const INSIGHTS_OPPORTUNITY_SEARCH: SearchSnapshot = \{[\s\S]*?onlyEligible: true,[\s\S]*?closingSoon: true,[\s\S]*?closingWithinDays: 14,/,
  );
  assert.match(page, /\.get\("source"\) === "insights"/);
  assert.match(page, /setSort\("closing"\)/);
  assert.match(page, /sortMode: "opportunity"/);
  assert.match(page, /sortMode: snapshot\.sortMode \?\? null/);
  assert.match(page, /void runSearch\(INSIGHTS_OPPORTUNITY_SEARCH\)/);
  assert.match(page, /void runSearch\(DEFAULT_SEARCH\)/);
  assert.match(
    insightsPage,
    /onlyEligible: true,[\s\S]*?closingWithinDays: 14,[\s\S]*?sortMode: "opportunity",[\s\S]*?limit: 3,/,
  );
  assert.doesNotMatch(
    insightsPage,
    /const priorityOpportunities = \[\.\.\.searchData\.items\]/,
  );
  assert.match(
    page,
    /closingWithinDays: snapshot\.closingWithinDays[\s\S]*?\?\? \(snapshot\.closingSoon \? 7 : null\)/,
  );
});

test("서버가 적용한 AI 우선 조건을 프런트엔드에서 다시 상세조건으로 제한하지 않는다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const filteredBody = page.match(
    /const filteredBids = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[resultBids, sort\]\);/,
  )?.[1] ?? "";

  assert.match(filteredBody, /\[\.\.\.resultBids\]\.sort/);
  assert.doesNotMatch(filteredBody, /\.filter\(/);
});

test("저장한 검색조건에 키워드와 선택 조건을 표시한다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /\.\.\.DEFAULT_SEARCH,[\s\S]*?\.\.\.savedSearch\.filters/);
  assert.match(page, /filters: \{[\s\S]*?\.\.\.currentSearchSnapshot\(\),[\s\S]*?semanticQuery: ""/);
  assert.match(page, /const snapshot = \{[\s\S]*?\.\.\.savedSearch\.filters,[\s\S]*?semanticQuery,/);
  assert.match(page, /setExcludeKeyword\(snapshot\.excludeKeyword\);[\s\S]*?prepareSemanticAnalysisState\(snapshot\.semanticQuery\)/);
  assert.match(page, /className="saved-search-item-conditions"/);
  assert.match(page, /savedSearch\.filters\.includeKeyword\.trim\(\)/);
  assert.match(page, /포함: \{savedSearch\.filters\.includeKeyword\}/);
  assert.match(page, /savedSearch\.filters\.excludeKeyword\.trim\(\)/);
  assert.match(page, /제외: \{savedSearch\.filters\.excludeKeyword\}/);
  assert.match(page, /savedSearch\.filters\.onlyEligible/);
  assert.match(page, /savedSearch\.filters\.closingSoon/);
  assert.match(css, /\.app-shell \.saved-search-item-conditions/);
  assert.match(css, /\.app-shell \.saved-search-item-conditions span\.exclude/);
  const savedConditionStyle = css.match(/\.app-shell \.saved-search-item-conditions span\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(savedConditionStyle, /background:\s*var\(--panel-solid\)/);
  assert.match(savedConditionStyle, /border:\s*1px solid var\(--border\)/);
  assert.match(page, /<span>\{savedSearch\.filters\.category\}<\/span>/);
  assert.match(page, /<span>\{savedSearch\.filters\.region\}<\/span>/);
});

test("AI 시맨틱 검색 입력창에서 Enter 키로 검색한다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /onKeyDown=\{\(event\) =>/);
  assert.match(page, /event\.key !== "Enter"/);
  assert.match(page, /event\.nativeEvent\.isComposing/);
  assert.match(page, /event\.shiftKey/);
  assert.match(page, /event\.preventDefault\(\)/);
  assert.match(page, /semanticQuery: event\.currentTarget\.value/);
  assert.match(page, /enterKeyHint="search"/);
  assert.match(page, /className="search-button-icon"/);
  assert.match(page, /className="search-button-label"/);
  const searchButtonStyle = css.match(/\.app-shell \.search-button\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(searchButtonStyle, /font-size:\s*15px/);
  const searchIconStyle = css.match(/\.app-shell \.search-button-icon svg\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(searchIconStyle, /height:\s*32px/);
  assert.match(searchIconStyle, /width:\s*32px/);
  const searchLabelStyle = css.match(/\.app-shell \.search-button-label\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(searchLabelStyle, /line-height:\s*1/);
});

test("AI 시맨틱 검색어를 최대 10개 저장하고 선택 및 삭제할 수 있다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const SEMANTIC_HISTORY_KEY = "findbid\.semantic-history\.v1"/);
  assert.match(page, /const SEMANTIC_HISTORY_LIMIT = 10/);
  assert.match(page, /const \[semanticHistory, setSemanticHistory\] = useState<string\[\]>\(\[\]\)/);
  assert.match(page, /window\.localStorage\.getItem\(SEMANTIC_HISTORY_KEY\)/);
  assert.match(page, /const restoredHistory = parsed[\s\S]*?setSemanticHistory\(restoredHistory\)/);
  assert.match(page, /\.slice\(0, SEMANTIC_HISTORY_LIMIT\)/);
  assert.match(page, /const rememberSemanticQuery = \(query: string\) =>/);
  assert.match(page, /toLocaleLowerCase\("ko-KR"\)/);
  assert.match(page, /window\.localStorage\.setItem\(SEMANTIC_HISTORY_KEY, JSON\.stringify\(next\)\)/);
  assert.match(page, /runSemanticSearchNow\(\{/);
  assert.match(page, /runSemanticSearchNow\(currentSearchSnapshot\(\)\)/);
  assert.match(page, /const selectSemanticHistory = \(query: string\) =>/);
  assert.match(page, /const deleteSemanticHistory = \(query: string\) =>/);
  assert.match(page, /const clearSemanticHistory = \(\) =>/);
  assert.match(page, /window\.localStorage\.removeItem\(SEMANTIC_HISTORY_KEY\)/);
  assert.match(page, /최근 검색어/);
  assert.match(page, /저장된 AI 검색어/);
  assert.match(page, /전체 삭제/);
  assert.match(page, /aria-label=\{`‘\$\{query\}’ 검색어 삭제`\}/);
  assert.match(css, /\.app-shell \.semantic-history-panel/);
  assert.match(css, /\.app-shell \.semantic-history-select/);
  assert.match(css, /\.app-shell \.semantic-history-delete/);
  assert.match(css, /\.app-shell \.hero:has\(\.semantic-history-panel\)[\s\S]*?overflow: visible[\s\S]*?z-index: 120/);
  assert.match(css, /\.app-shell \.semantic-history-panel[\s\S]*?z-index: 1000/);
});

test("관심공고를 브라우저에 저장하고 별도 모달로 표시한다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const SAVED_BIDS_KEY = "findbid\.saved-bids\.v1"/);
  assert.match(page, /const SAVED_BIDS_LIMIT = 50/);
  assert.match(page, /const \[savedBids, setSavedBids\] = useState<Bid\[\]>\(\[\]\)/);
  assert.match(page, /window\.localStorage\.getItem\(SAVED_BIDS_KEY\)/);
  assert.match(page, /window\.localStorage\.setItem\(SAVED_BIDS_KEY, JSON\.stringify\(nextSavedBids\)\)/);
  assert.match(page, /function normalizeSavedBids\(value: unknown\): Bid\[\]/);
  assert.match(page, /const toggleSaved = async \(bid: Bid\) =>/);
  assert.match(page, /const \[savedBidsOpen, setSavedBidsOpen\] = useState\(false\)/);
  assert.match(page, /const \[clearingSavedBids, setClearingSavedBids\] = useState\(false\)/);
  assert.match(page, /const clearSavedBids = async \(\) =>/);
  assert.match(page, /window\.confirm\(/);
  assert.match(page, /window\.localStorage\.removeItem\(SAVED_BIDS_KEY\)/);
  assert.match(page, /className="saved-bids-clear-all"/);
  assert.match(page, /\{clearingSavedBids \? "삭제 중…" : "전체 삭제"\}/);
  assert.doesNotMatch(page, /id="saved"/);
  assert.match(page, /aria-labelledby="saved-bids-title"/);
  assert.match(page, /aria-label=\{`관심공고 \$\{saved\.length\}건 보기`\}/);
  assert.match(page, /\{saved\.length > 0 && <em>\{saved\.length\}<\/em>\}/);
  assert.doesNotMatch(page, /scrollToSavedBids/);
  assert.match(page, /className="icon-button saved-bids-header-button"/);
  assert.match(page, /className="saved-bids-cart-icon"/);
  assert.match(page, /className="cart-diamond"/);
  assert.match(page, /className="cart-outline" d="M1 3\.5h3\.2l1\.6 12h13\.4L21\.5 5\.5"/);
  assert.doesNotMatch(page, /className="cart-outline"[^>]*H6/);
  assert.match(page, /onClick=\{\(\) => setSavedBidsOpen\(true\)\}/);
  assert.match(page, /aria-label=\{`관심공고 \$\{saved\.length\}건 보기`\}/);
  assert.match(page, /className="modal-layer saved-bids-modal-layer"/);
  assert.match(page, /className="saved-bids-modal"/);
  assert.match(page, /aria-label="관심공고 창 닫기"/);
  assert.match(page, /if \(event\.key === "Escape"\) setSavedBidsOpen\(false\)/);
  assert.match(page, /savedBids\.map\(\(bid\) =>/);
  assert.match(page, /공고 카드의 마름모 버튼을 누르면 이곳에 저장됩니다/);
  assert.match(page, /setSavedBidsOpen\(false\);[\s\S]*?void openNoticeDetail\(bid\)/);
  assert.match(page, /className="saved-bid-score-badge">[\s\S]*?적합도 \{bid\.score\}점/);
  assert.match(page, /className="saved-bid-fact-region">[\s\S]*?참가 지역[\s\S]*?<strong>\{bid\.region\}<\/strong>/);
  assert.match(page, /className="saved-bid-fact-deadline">[\s\S]*?마감일시[\s\S]*?<strong>\{bid\.closeAt\}<\/strong>/);
  assert.doesNotMatch(page, /saved-bid-fact-wide/);
  assert.doesNotMatch(css, /\.app-shell \.saved-bids-section/);
  assert.match(css, /\.app-shell \.saved-bids-modal/);
  assert.match(css, /\.app-shell \.saved-bids-modal-content/);
  assert.match(css, /\.app-shell \.saved-bids-list/);
  assert.match(css, /\.app-shell \.saved-bid-card/);
  assert.match(css, /\.app-shell \.saved-bids-clear-all/);
  assert.match(css, /\.app-shell \.saved-bid-meta \.saved-bid-score-badge/);
  assert.match(css, /\.mobile-dock em/);
  assert.match(css, /\.saved-bids-header-button i/);
  assert.match(css, /\.saved-bids-cart-icon/);
  assert.match(
    css,
    /\.saved-bids-cart-icon \.cart-diamond\s*\{[\s\S]*?fill:\s*var\(--gold-accent\)/,
  );
  assert.match(
    css,
    /\.app-shell \.theme-toggle \.theme-icon\s*\{[\s\S]*?height:\s*23px/,
  );
  assert.match(
    css,
    /\.app-shell \.theme-toggle \.theme-icon\s*\{[\s\S]*?transform:\s*translateY\(-0\.2px\)/,
  );
  assert.equal((page.match(/className="theme-icon"/g) ?? []).length, 2);
});

test("주요 메뉴에 심플한 선형 아이콘을 표시한다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  const nav = page.match(/<nav className="main-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
  assert.equal((nav.match(/className="nav-icon"/g) ?? []).length, 3);
  assert.match(nav, /입찰 탐색/);
  assert.match(nav, /인사이트/);
  assert.match(nav, /알림/);
  assert.doesNotMatch(nav, /관심 공고/);
  assert.match(css, /\.app-shell \.main-nav \.nav-icon/);
});

test("검색 상세조건 아래에 Trander AI 분석 배너를 제공한다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /className="trander-banner"/);
  assert.match(page, /href="https:\/\/www\.trander\.it"/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(page, /입찰공고 AI 분석 플랫폼[\s\S]*?-\s*Trander/);
  assert.match(css, /url\("\/trander-ai-bid-banner\.png"\)/);
  assert.match(css, /\.app-shell \.trander-banner:focus-visible/);
  assert.match(css, /\.app-shell \.filters \.filter-scroll\s*\{[\s\S]*?overflow-y: auto/);
});

test("익명 세션 추천 피드백과 비밀번호 관리페이지를 제공한다", async () => {
  const [page, adminPage, searchRoute, feedbackRoute, adminAuth, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/admin-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(searchRoute, /anonymousSession\(request\)/);
  assert.match(searchRoute, /"x-session-id": sessionId/);
  assert.match(feedbackRoute, /\/api\/v1\/feedback/);
  assert.match(page, /추천 결과 피드백/);
  assert.match(page, /공고 내용을 확인한 결과가 우리 회사에 적합한지 알려주세요/);
  assert.match(page, /추천 적합/);
  assert.match(page, /추천 부적합/);
  assert.match(page, /부적합 사유를 모두 선택한 후 적용해 주세요/);
  assert.match(page, /selectedFeedbackReasons/);
  assert.match(page, /semanticConditions/);
  assert.match(page, /conditionIds/);
  assert.match(page, /선택한 사유 적용/);
  assert.match(page, /reasons,/);
  assert.match(page, /이 공고를 추천에서 제외할까요/);
  assert.match(page, /다른 검색 세션이나 원본 공고에는 영향을 주지 않습니다/);
  assert.match(page, /setExcludeConfirmOpen\(false\)/);
  assert.match(css, /\.app-shell \.feedback-confirm-modal/);
  assert.match(page, /이 공고를 현재 세션에서 제외/);
  assert.match(page, /상세평가 취소/);
  assert.match(page, /postRecommendationFeedback\([\s\S]*?"favorite"/);
  assert.match(page, /favoriteSearchId/);
  assert.match(adminPage, /추천 운영관리/);
  assert.match(adminPage, /\/api\/admin\/login/);
  assert.match(adminPage, /\/api\/admin\/status/);
  assert.match(adminAuth, /process\.env\.FINDBID_ADMIN_PASSWORD \?\? "findbid2026"/);
  assert.match(adminAuth, /HttpOnly/);
  assert.match(adminAuth, /SameSite=Strict/);
  assert.match(css, /\.app-shell \.bid-feedback/);
  assert.match(css, /\.admin-login-card/);
  assert.match(css, /\.admin-dashboard/);
});

test("기업 프로필을 브라우저에 저장하고 검색 요청에 반영한다", async () => {
  const [page, bids, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/bids.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const COMPANY_PROFILE_KEY = "findbid\.company-profile\.v1"/);
  assert.match(page, /window\.localStorage\.getItem\(COMPANY_PROFILE_KEY\)/);
  assert.match(page, /window\.localStorage\.setItem\(COMPANY_PROFILE_KEY, JSON\.stringify\(nextProfile\)\)/);
  assert.match(page, /companyProfile: companyProfileRef\.current/);
  assert.match(page, /const saveCompanyProfile = \(event: React\.FormEvent<HTMLFormElement>\) =>/);
  assert.match(page, /companyProfileRef\.current = nextProfile/);
  assert.match(page, /runSearchNow\(currentSearchSnapshot\(\)\)/);
  assert.match(page, /function companyProfileInitials\(name: string\): string/);
  assert.match(page, /companyProfileInitials\(companyProfile\.name\)/);
  assert.doesNotMatch(page, /<Mark>IB<\/Mark>/);
  assert.match(css, /\.profile-initials\s*\{[^}]*transform:\s*translateY\(-1px\)/s);
  assert.match(page, /className="profile-form"/);
  assert.match(page, /프로필 저장 및 검색 반영/);
  assert.match(page, /보유 면허·자격/);
  assert.match(page, /주요 사업 분야/);
  assert.match(page, /유사 수행실적/);
  assert.match(page, /수행 가능 지역/);
  assert.match(page, /function normalizeServiceRegions\(values: unknown\): string\[\]/);
  assert.match(page, /value === "전국" \? "전체 지역" : value/);
  assert.match(page, /const toggleProfileServiceRegion = \(selectedRegion: string\) =>/);
  assert.match(page, /className="profile-region-options"/);
  assert.match(page, /role="group"/);
  assert.match(page, /aria-pressed=\{selected\}/);
  assert.match(page, /복수 선택할 수 있습니다/);
  assert.match(page, /제외 사업 분야/);
  assert.match(bids, /export type CompanyProfile/);
  assert.match(bids, /serviceRegions: \["전체 지역"\]/);
  assert.match(css, /\.app-shell \.profile-form/);
  assert.match(css, /\.app-shell \.profile-field/);
  assert.match(css, /\.app-shell \.profile-region-options/);
  assert.match(css, /button\[aria-pressed="true"\]/);
  assert.match(css, /\.app-shell \.profile-form-actions/);
});

test("검색 과정과 처리시간을 펼쳐서 확인할 수 있다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /searchTrace\?: string\[\]/);
  assert.match(page, /setSearchTrace\(data\.queryPlan\?\.searchTrace \?\? \[\]\)/);
  assert.match(page, />검색 과정 보기<\/span>/);
  assert.doesNotMatch(page, /의미 벡터 (?:적용|사용)/);
  assert.doesNotMatch(page, /semanticEngine|setSemanticEngine/);
  assert.match(page, /className="search-trace-panel"/);
  assert.match(
    page,
    /className="intent-heading"[\s\S]*?<span className="intent-label">AI가 이해한 조건<\/span>[\s\S]*?className="search-trace-toggle"/,
  );
  assert.match(page, /className="intent-values"/);
  assert.match(css, /\.app-shell \.parsed-intent[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\) auto/);
  assert.match(css, /\.app-shell \.intent-values[\s\S]*?display: flex[\s\S]*?flex-wrap: wrap/);
  assert.match(page, /searchElapsedMs\.toLocaleString\("ko-KR"\)/);
  assert.match(css, /\.app-shell \.search-trace-toggle/);
  assert.match(css, /\.app-shell \.search-trace-panel/);
});

test("공고 제목 상세정보와 AI 상세 분석을 서로 다른 창으로 제공한다", async () => {
  const [page, css, bidsSource, detailRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/bids.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bids/[bidId]/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const \[noticeDetail, setNoticeDetail\]/);
  assert.match(page, /function BidTitle/);
  assert.match(page, /onClick=\{onOpen\}/);
  assert.match(page, /onOpen=\{\(\) => void openNoticeDetail\(bid\)\}/);
  assert.match(page, /aria-label=\{`\$\{bid\.title\} AI 상세 분석`\}/);
  assert.match(page, /aria-label="입찰공고 상세정보"/);
  assert.match(page, /aria-label="AI 입찰공고 상세 분석"/);
  assert.match(page, /공고 개요/);
  assert.match(page, /참가 자격 및 조건/);
  assert.match(page, /적합도 산정 근거/);
  assert.match(page, /function OriginalNoticeAction/);
  assert.match(page, /function AttachmentDocuments/);
  assert.match(page, />첨부문서</);
  assert.match(page, /attachment\.fileType === fileType/);
  assert.match(page, /aria-label=\{`\$\{attachment\.name\} 열기`\}/);
  assert.match(page, /target="_blank"/);
  assert.match(bidsSource, /sourceUrl\?: string \| null/);
  assert.match(bidsSource, /attachments\?: BidAttachment\[\]/);
  assert.match(detailRoute, /\/api\/v1\/bids\/\$\{encodeURIComponent\(bidId\)\}/);
  assert.match(css, /\.app-shell \.notice-detail-title/);
  assert.match(css, /\.app-shell \.notice-summary/);
  assert.match(css, /\.app-shell \.notice-attachments/);
  assert.match(css, /\.app-shell \.attachment-list a/);
});

test("공고 카드에 전체 검색결과 기준 연번을 표시한다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /filteredBids\.map\(\(bid, index\) =>/);
  assert.match(page, /\(currentPage - 1\) \* PAGE_SIZE \+ index \+ 1/);
  assert.match(page, /className="bid-sequence"/);
  assert.match(page, /검색결과 \$\{\(currentPage - 1\) \* PAGE_SIZE \+ index \+ 1\}번/);
  assert.match(
    page,
    /className="bid-meta-top"[\s\S]*?className="bid-sequence"[\s\S]*?className=\{`category category-\$\{bid\.category\}`\}/,
  );
  assert.match(css, /\.app-shell \.bid-sequence/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  const sequenceStyle = css.match(/\.app-shell \.bid-sequence\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(sequenceStyle, /color:\s*var\(--muted\)/);
  assert.doesNotMatch(sequenceStyle, /\bbackground\s*:/);
  assert.doesNotMatch(sequenceStyle, /\bborder(?:-radius)?\s*:/);
});

test("페이지 이동 버튼은 5페이지 단위로 이동한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const PAGE_JUMP = 5/);
  assert.match(page, /Math\.max\(1, currentPage - PAGE_JUMP\)/);
  assert.match(page, /Math\.min\(totalPages, currentPage \+ PAGE_JUMP\)/);
  assert.match(page, /이전 5페이지/);
  assert.match(page, /다음 5페이지/);
});

test("추천 공고 전체 개수에 건 단위를 함께 표시한다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /className="recommendation-count"/);
  assert.match(page, /\{searchTotal\.toLocaleString\("ko-KR"\)\}<em>건<\/em>/);
  assert.match(css, /\.app-shell \.result-toolbar h2 span[\s\S]*?font-size:\s*17px/);
  assert.match(css, /\.recommendation-count em/);
});

test("참가 가능 및 7일 내 마감 개수를 검색 API 응답으로 표시한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /eligibleTotal:\s*number/);
  assert.match(page, /closingSoonTotal:\s*number/);
  assert.match(page, /setEligibleTotal\(data\.eligibleTotal\)/);
  assert.match(page, /setClosingSoonTotal\(data\.closingSoonTotal\)/);
  assert.match(page, /\{eligibleTotal\.toLocaleString\("ko-KR"\)\}/);
  assert.match(page, /\{closingSoonTotal\.toLocaleString\("ko-KR"\)\}/);
  assert.match(page, /<small>전체 공고<\/small>/);
  assert.match(page, /<small>참가 가능<\/small>/);
  assert.match(page, /<small>평균 적합도<\/small>/);
  assert.match(page, /<small>7일 내 마감<\/small>/);
  assert.doesNotMatch(page, /현재 조건 기준/);
  assert.doesNotMatch(page, /<strong>38<em>건<\/em><\/strong>/);
  assert.doesNotMatch(page, /<strong>12<em>건<\/em><\/strong>/);
});

test("프로필 기반 적합도와 신뢰도 및 산정 근거를 표시한다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /averageScore:\s*number/);
  assert.match(page, /setAverageScore\(data\.averageScore\)/);
  assert.match(page, /\{averageScore\.toLocaleString\("ko-KR"\)\}/);
  assert.match(page, /신뢰도 \{selected\.scoreConfidence \?\? 0\}%/);
  assert.match(page, /신뢰도 \{bid\.scoreConfidence \?\? 0\}%/);
  assert.match(page, /적합도 산정 근거/);
  assert.match(page, /Object\.entries\(selected\.scoreBreakdown \?\? \{\}\)/);
  assert.match(page, /selected\.scoreReasons/);
  assert.doesNotMatch(page, /<strong>87<em>점<\/em><\/strong>/);
  assert.match(css, /\.app-shell \.score-breakdown/);
  assert.match(css, /\.app-shell \.score-confidence/);
});

test("공고 카드에 일치 역량과 속성 검색조건을 구분해 표시한다", async () => {
  const [page, css, repository] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(
      new URL("../../backend/app/repositories/external_bid_repository.py", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(page, /bid\.matched\.length > 0/);
  assert.match(page, /bid\.matched\.map\(\(item\) =>/);
  assert.match(page, /bid\.matchedConditions \?\? \[\]/);
  assert.match(page, /\(bid\.matchedConditions \?\? \[\]\)\.map\(\(item\) =>/);
  assert.match(page, /검색조건/);
  assert.match(page, /일치하는 검색조건/);
  assert.match(page, />✓ \{item\}</);
  assert.match(repository, /"사업금액: "/);
  assert.doesNotMatch(repository, /"사업금액\(VAT별도\): "/);
  const matchedItemStyle = css.match(
    /\.app-shell \.match-group span:not\(\.match-label\)\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const matchedLabelStyle = css.match(
    /\.app-shell \.match-label\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  assert.match(matchedLabelStyle, /color:\s*var\(--muted\)/);
  assert.match(matchedLabelStyle, /font-weight:\s*400/);
  assert.match(matchedItemStyle, /background:\s*transparent/);
  assert.match(matchedItemStyle, /border:\s*0/);
  assert.match(matchedItemStyle, /color:\s*var\(--muted\)/);
  assert.match(matchedItemStyle, /font-size:\s*11px/);
  assert.match(matchedItemStyle, /font-weight:\s*600/);
  assert.match(matchedItemStyle, /padding:\s*0/);
});

test("긴 수요기관명은 두 줄 말줄임과 접근 가능한 툴팁으로 표시한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /function AgencyName/);
  assert.match(page, /trigger\.scrollHeight > trigger\.clientHeight/);
  assert.match(page, /new ResizeObserver\(measure\)/);
  assert.match(page, /isTruncated \? " is-truncated" : ""/);
  assert.match(page, /aria-describedby=\{isTruncated \? tooltipId : undefined\}/);
  assert.match(page, /className="agency-tooltip-content"/);
  assert.match(page, /role="tooltip"/);
  assert.match(page, /<AgencyName bidId=\{bid\.id\} name=\{bid\.demandAgency\} \/>/);
  assert.match(css, /-webkit-line-clamp:\s*2/);
  assert.match(css, /\.agency-tooltip-trigger\.is-truncated/);
  assert.match(css, /\.agency-tooltip:hover \.agency-tooltip-content/);
  assert.match(css, /\.agency-tooltip:focus-within \.agency-tooltip-content/);
});

test("잘린 공고 제목은 기존 상세 클릭과 조건부 툴팁을 함께 제공한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /function BidTitle/);
  assert.match(page, /trigger\.scrollWidth > trigger\.clientWidth/);
  assert.match(page, /className="bid-title-tooltip-content"/);
  assert.match(page, /aria-describedby=\{isTruncated \? tooltipId : undefined\}/);
  assert.match(page, /<BidTitle/);
  assert.match(page, /onOpen=\{\(\) => void openNoticeDetail\(bid\)\}/);
  assert.match(css, /\.bid-title\.is-truncated/);
  assert.match(css, /\.bid-title-tooltip:hover \.bid-title-tooltip-content/);
  assert.match(css, /\.bid-title-tooltip:focus-within \.bid-title-tooltip-content/);
});

test("금액 항목 명칭은 VAT별도 사업금액으로 통일한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.equal((page.match(/>사업금액\(VAT별도\)<\/(?:span|label)>/g) ?? []).length, 4);
  assert.doesNotMatch(page, /추정금액/);
});

test("요약 카드의 값과 단위는 축소된 글자 크기를 사용한다", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const valueStyle = css.match(
    /\.app-shell \.metrics strong\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const unitStyle = css.match(
    /\.app-shell \.metrics strong em\s*\{([^}]*)\}/,
  )?.[1] ?? "";

  assert.match(valueStyle, /font-size:\s*22px/);
  assert.match(unitStyle, /font-size:\s*11px/);
  assert.match(css, /@media[\s\S]*?\.app-shell \.metrics strong\s*\{[\s\S]*?font-size:\s*20px/);
});

test("FindBid 로고는 테마별 3배 해상도 투명 배경 PNG 워드마크를 사용한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /src="\/findbid-b-icon-3x\.png"/);
  assert.match(page, /src="\/findbid-b-icon-3x-dark\.png"/);
  assert.match(page, /className="word-find">Find/);
  assert.match(page, /className="word-bid">Bid/);
  assert.match(page, /AI Bid Searcher/);
  assert.doesNotMatch(page, /id="findbid-fb-gradient"/);
  assert.match(css, /\.app-shell \.logo-symbol img/);
  assert.doesNotMatch(css, /\.app-shell \.logo-symbol\s*\{[^}]*filter:/s);
  assert.match(css, /\.app-shell\.dark \.logo-symbol \.logo-mark-dark/);
  const logoHoverStyle = css.match(/\.app-shell \.logo:hover \.logo-symbol img\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(logoHoverStyle, /scale\(/);
  assert.match(css, /\.app-shell \.word-bid/);
  assert.match(css, /background-clip:\s*text/);
});

test("관리자가 추천 피드백 수집과 표시를 끌 수 있다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const adminRoute = await readFile(
    new URL("../app/api/admin/feedback-settings/route.ts", import.meta.url),
    "utf8",
  );
  const publicRoute = await readFile(
    new URL("../app/api/feedback/settings/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(page, /const \[feedbackEnabled, setFeedbackEnabled\] = useState\(false\)/);
  assert.match(page, /className="analysis-section analysis-feedback"/);
  assert.match(page, /detail-drawer\$\{feedbackBidId === selected\.id \? " feedback-expanded" : ""\}/);
  assert.match(page, /data\.queryPlan\?\.feedbackEnabled === true/);
  assert.match(admin, /추천 결과 피드백/);
  assert.match(admin, /피드백 받음/);
  assert.match(admin, /받지 않음/);
  assert.match(admin, /updateFeedbackEnabled/);
  assert.match(adminRoute, /isAdminAuthenticated/);
  assert.match(publicRoute, /feedback\/settings/);
});

test("인사이트 메뉴는 별도 페이지에서 네 가지 우선 분석을 제공한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const insights = await readFile(
    new URL("../app/insights/page.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /<a href="\/insights">/);
  assert.doesNotMatch(page, /id="insight"/);
  assert.doesNotMatch(page, /const insightData = useMemo/);
  assert.match(insights, /const insightData = useMemo/);
  assert.match(insights, />참여 기회 요약</);
  assert.match(insights, />기업 역량과 시장 수요 비교</);
  assert.match(insights, />입찰시장 동향</);
  assert.match(insights, />참여 제한 요인 분석</);
  assert.match(insights, /className="active" href="\/insights" aria-current="page"/);
  assert.match(insights, /const INSIGHT_PAGE_SIZE = 200/);
  assert.match(insights, /const INSIGHT_TARGET_SIZE = 1_000/);
  assert.match(insights, /page <= maximumPages/);
  assert.match(insights, /uniqueBids\.set\(bid\.id, bid\)/);
  assert.match(insights, /건 분석 중/);
  assert.match(css, /\.app-shell \.insight-dashboard/);
  assert.match(css, /\.app-shell \.insights-main/);
  assert.match(css, /\.app-shell \.insight-grid/);
  assert.match(css, /\.app-shell \.demand-list/);
  assert.match(css, /\.app-shell \.market-bars/);
  assert.match(insights, /const PARTICIPATION_RESTRICTION_RULES/);
  assert.match(insights, /eligibilityMode: "not_eligible"/);
  assert.match(insights, /const \[restrictionBids, setRestrictionBids\] = useState<Bid\[]>\(\[\]\)/);
  assert.match(insights, /restrictionBids\.map\(participationRestrictionLabel\)/);
  assert.doesNotMatch(insights, /searchData\.items\.filter\(\(bid\) => bid\.eligibility !== "참가 가능"\)/);
  assert.match(insights, />보완 가능성이 높은 공고</);
  assert.match(insights, /공고별 주요 제한 요인 1개를 기준으로 집계했습니다/);
  assert.doesNotMatch(insights, />놓치고 있는 공고 분석</);
  assert.match(css, /\.app-shell \.restriction-list/);
  assert.match(css, /\.app-shell \.insight-dashboard\s*\{[\s\S]*?border-radius:\s*var\(--radius-lg\)/);
  assert.match(css, /\.app-shell \.insight-panel\s*\{[\s\S]*?border-radius:\s*var\(--radius-md\)/);
  assert.match(css, /\.app-shell \.opportunity-summary > div\s*\{[\s\S]*?border-radius:\s*9px/);
  assert.match(
    css,
    /\.app-shell\.insights-page \.insights-hero h1,\s*\.app-shell\.insights-page \.insight-dashboard-head h2,\s*\.app-shell\.insights-page \.insight-panel-head h3\s*\{\s*font-weight:\s*700/,
  );
  assert.match(css, /\.app-shell\.insights-page \.insight-panel-head h3\s*\{[\s\S]*?font-size:\s*17px/);
  assert.match(css, /\.app-shell\.insights-page \.demand-list li > span\s*\{[\s\S]*?font-size:\s*13px/);
  assert.match(
    css,
    /\.app-shell\.insights-page \.market-bars > div\s*\{[\s\S]*?grid-template-columns:\s*56px minmax\(100px, 400px\) 72px/,
  );
  assert.match(css, /\.app-shell\.insights-page \.market-bars > div > strong\s*\{[\s\S]*?text-align:\s*right/);
});

test("알림 메뉴는 관리자 게시물과 연결된 별도 목록 페이지를 제공한다", async () => {
  const [home, insights, notifications, admin, publicRoute, adminRoute, itemRoute, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/notifications/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/notifications/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/notifications/[notificationId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(home, /href="\/notifications"/);
  assert.match(insights, /href="\/notifications"/);
  assert.match(notifications, /className="active" href="\/notifications" aria-current="page"/);
  assert.match(notifications, /fetch\("\/api\/notifications"/);
  assert.match(notifications, /<th scope="col">게시일시<\/th><th scope="col">게시자<\/th><th scope="col">내용<\/th>/);
  assert.match(notifications, /<SiteFooter \/>/);
  assert.match(admin, />알림 게시물 관리</);
  assert.match(admin, /saveNotification/);
  assert.match(admin, /deleteNotification/);
  assert.match(admin, /method: editing \? "PUT" : "POST"/);
  assert.match(admin, /<th scope="col">게시일시<\/th>/);
  assert.match(admin, /<th scope="col">게시자<\/th>/);
  assert.match(admin, /<th scope="col">내용<\/th>/);
  assert.match(publicRoute, /\/api\/v1\/notifications\?limit=100/);
  assert.match(adminRoute, /isAdminAuthenticated/);
  assert.match(adminRoute, /method: "GET" \| "POST"/);
  assert.match(itemRoute, /method: "PUT" \| "DELETE"/);
  assert.match(itemRoute, /x-internal-key/);
  assert.match(css, /\.app-shell \.notifications-table/);
  assert.match(css, /\.admin-notification-control/);
});

test("공통 Footer와 세 개의 공개 안내 페이지를 제공한다", async () => {
  const [home, insights, footer, about, privacy, terms, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_components/site-footer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/about/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/terms/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(home, /<SiteFooter \/>/);
  assert.match(insights, /<SiteFooter \/>/);
  assert.match(footer, /© 2026 INTERWEB\. All rights reserved\./);
  assert.match(footer, /href="\/about"/);
  assert.match(footer, /href="\/privacy"/);
  assert.match(footer, /href="\/terms"/);
  assert.match(footer, /mailto:help_findbid@interweb\.co\.kr/);
  assert.match(footer, />\s*고객의 소리\s*</);
  assert.match(footer, /서비스에 대한 문의 또는 제안 사항을 보내실 수 있습니다\./);
  assert.match(footer, /className="site-footer-contact-trigger"/);
  assert.match(footer, /aria-controls="site-footer-contact-popover"/);
  assert.match(footer, /aria-expanded=\{contactOpen\}/);
  assert.match(footer, /className="site-footer-contact-popover"/);
  assert.match(footer, /document\.addEventListener\("pointerdown", closeOutside\)/);
  assert.match(footer, /event\.key === "Escape"/);
  assert.match(footer, /navigator\.clipboard\.writeText\(CUSTOMER_EMAIL\)/);
  assert.match(footer, /document\.execCommand\("copy"\)/);
  assert.match(footer, /고객의 소리 이메일 주소 복사/);
  assert.match(footer, /"주소 복사"/);
  assert.match(footer, /"복사됨"/);
  assert.match(about, /서비스 소개 \| FindBid/);
  assert.match(privacy, /개인정보처리방침 \| FindBid/);
  assert.match(terms, /이용약관 \| FindBid/);
  assert.match(css, /\.app-shell \.site-footer/);
  assert.match(css, /\.app-shell \.site-footer-contact-row button/);
  assert.match(footer, /className="site-footer-contact-row"/);
  assert.match(css, /\.app-shell \.site-footer-contact-row\s*\{[\s\S]*?align-items:\s*center/);
  assert.match(
    css,
    /\.app-shell \.site-footer-contact-row button\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;/,
  );
  assert.match(css, /\.app-shell \.site-footer-contact:hover \.site-footer-contact-popover/);
  assert.match(css, /\.app-shell \.site-footer-contact:focus-within \.site-footer-contact-popover/);
  assert.match(css, /\.app-shell \.site-footer-contact\.is-open \.site-footer-contact-popover/);
  assert.match(css, /\.app-shell \.info-content/);
});
