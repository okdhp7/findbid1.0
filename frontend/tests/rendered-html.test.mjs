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
  assert.doesNotMatch(html, /class="bid-search-loading-layer"/);
  assert.match(html, /placeholder="AI, 웹서비스, 플랫폼" value=""/);
  assert.match(html, /placeholder="장비 납품, 인력파견" value=""/);
  assert.doesNotMatch(html, /1,284/);
});

test("페이지 최상단과 공고 목록 하단 이동 기능을 제공한다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /footerBottomRef/);
  assert.match(page, /scrollIntoView/);
  assert.match(page, /<SiteFooter \/>[\s\S]*?ref=\{footerBottomRef\}/);
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
  assert.match(css, /\.app-shell \.semantic-card\s*\{[\s\S]*?border:\s*1px solid var\(--border-strong\)/);
  assert.match(css, /\.app-shell \.filters\s*\{[\s\S]*?border-radius:\s*var\(--radius-lg\)/);
  assert.match(css, /\.app-shell \.bid-card\s*\{[\s\S]*?border-radius:\s*var\(--radius-lg\)/);
  assert.match(css, /\.app-shell \.metrics article\s*\{[\s\S]*?border-radius:\s*var\(--radius-md\)/);
  assert.match(css, /\.app-shell \.bid-search-loading-layer\s*\{[\s\S]*?backdrop-filter:\s*blur\(4px\);[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*130;/);
  assert.match(css, /\.app-shell \.bid-search-loading-card/);
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
  assert.match(page, /const \[isSearching, setIsSearching\] = useState\(true\)/);
  assert.match(page, /className=\{`result-list \$\{isSearching \? "is-loading" : ""\}`\}/);
  assert.match(page, /aria-busy=\{isSearching\}/);
  assert.match(page, /className="bid-search-loading-layer"/);
  assert.match(page, /const SEARCH_LOADING_DELAY_MS = 500/);
  assert.match(page, /window\.setTimeout\([\s\S]*?setShowSearchLoadingLayer\(true\)[\s\S]*?SEARCH_LOADING_DELAY_MS/);
  assert.match(page, /window\.clearTimeout\(timer\)/);
  assert.match(page, /showSearchLoadingLayer &&/);
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
    /className="title-reset-button"[\s\S]*?<span aria-hidden="true">↻<\/span>[\s\S]*?조건 초기화/,
  );
  assert.match(page, /className="apply-button"[\s\S]*?검색조건 저장\/선택/);
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
  assert.match(css, /--button-blue:\s*#2f75e8/);
  assert.match(css, /--button-blue-deep:\s*#2f75e8/);
  assert.match(css, /--accent:\s*#2f75e8/);
  assert.match(css, /--accent-light:\s*#2f75e8/);
  assert.match(css, /--accent-deep:\s*#2f75e8/);
  assert.match(searchButtonStyle, /var\(--button-blue\)/);
  assert.match(css, /\.app-shell \.apply-button,[\s\S]*?var\(--button-blue\)/);
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

test("추천 입찰공고 주의사항을 팝오버로 표시하고 확인 버튼으로 닫는다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const \[recommendationNoticeOpen, setRecommendationNoticeOpen\] = useState\(false\)/);
  assert.match(page, /주의사항 보기\s*<\/button>/);
  assert.match(page, /aria-controls="recommendation-notice-popover"/);
  assert.match(page, /className="recommendation-notice-icon" aria-hidden="true">⚠<\/span>/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /입찰 참여 전 필수 확인/);
  assert.match(page, /className="recommendation-notice-list"/);
  assert.match(page, /className="recommendation-notice-confirm"/);
  assert.match(page, /모든 입찰공고의 정보는 나라장터 원문의 내용과 다를 수 있으므로 반드시 공고 원문 및 첨부 파일을 확인하시기 바랍니다/);
  assert.match(page, /onClick=\{\(\) => setRecommendationNoticeOpen\(false\)\}/);
  assert.match(css, /\.app-shell \.recommendation-notice-popover/);
  assert.match(css, /\.app-shell \.recommendation-notice-heading/);
  assert.match(css, /\.app-shell \.recommendation-notice-list li\.is-important/);
  assert.match(css, /html\[data-findbid-theme="dark"\] \.app-shell \.recommendation-notice-trigger/);
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
  const [page, adminPage, searchRoute, feedbackRoute, adminAuth, css, compose] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/admin-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../../compose.yaml", import.meta.url), "utf8"),
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
  assert.match(adminPage, /운영정보 새로고침/);
  assert.match(adminPage, /Promise\.all\(\[loadStatus\(\), loadNotifications\(\)\]\)/);
  assert.match(adminAuth, /process\.env\.FINDBID_ADMIN_PASSWORD\?\.trim\(\)/);
  assert.match(adminAuth, /FINDBID_ADMIN_PASSWORD 환경변수가 설정되지 않았습니다/);
  assert.doesNotMatch(adminAuth, /findbid2026/);
  assert.match(compose, /FINDBID_ADMIN_PASSWORD: \$\{FINDBID_ADMIN_PASSWORD:\?FINDBID_ADMIN_PASSWORD is required\}/);
  assert.doesNotMatch(compose, /^\s+ADMIN_PASSWORD:/m);
  assert.match(adminAuth, /HttpOnly/);
  assert.match(adminAuth, /SameSite=Strict/);
  assert.match(css, /\.app-shell \.bid-feedback/);
  assert.match(css, /\.admin-login-card/);
  assert.match(adminPage, /authenticated === null/);
  assert.match(adminPage, /관리자 인증을 확인하고 있습니다/);
  assert.match(css, /\.admin-auth-loading/);
  assert.match(css, /\.admin-dashboard/);
  assert.match(css, /\.admin-activity-table-wrap\s*\{[\s\S]*?max-height: 720px/);
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
  assert.match(page, /수행 가능 기관유형/);
  assert.match(page, /const toggleProfileServiceAgencyType = \(selectedAgencyType: string\) =>/);
  assert.match(page, /className="profile-agency-type-options"/);
  assert.match(page, /className="profile-agency-type-tooltip"/);
  assert.match(page, /fetch\("\/api\/company\/agency-types"/);
  assert.match(page, /fetch\("\/api\/company\/profile"/);
  assert.match(page, /searchTrigger/);
  assert.match(page, /"ai_button"/);
  assert.match(page, /fetch\(\s*`\/api\/company\/agency-suggestions\?q=/);
  assert.match(page, /agency-suggestions\?q=\$\{encodeURIComponent\(query\)\}&limit=\$\{agencySuggestionLimit\}/);
  assert.match(page, /const AGENCY_SUGGESTION_PAGE_SIZE = 20/);
  assert.match(page, /const AGENCY_SUGGESTION_MAX = 100/);
  assert.match(page, /className="agency-suggestion-more"/);
  assert.match(page, /agencySuggestionsHasMore/);
  assert.match(page, /current \+ AGENCY_SUGGESTION_PAGE_SIZE,[\s\S]*?AGENCY_SUGGESTION_MAX/);
  assert.match(page, /<strong>더 보기<\/strong>/);
  assert.match(page, /suggestion\.agencyName/);
  assert.match(page, /공고 \{suggestion\.bidCount\.toLocaleString\(\)\}건/);
  assert.doesNotMatch(page, /하위기관 \$\{suggestion\.agencyCount/);
  assert.doesNotMatch(page, /\$\{suggestion\.topLevelAgencyName\} 소속/);
  assert.match(page, /className="agency-suggestion-direct"/);
  assert.match(page, /‘\{activeDemandAgencyFragment\(demandAgencyInput\)\}’ 입력/);
  assert.doesNotMatch(css, /\.app-shell \.agency-autocomplete \.input-with-icon input\s*\{[\s\S]*?font-size:\s*12px/);
  assert.match(css, /\.app-shell \.agency-suggestion-list \.agency-suggestion-direct\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?text-align:\s*center;/);
  assert.match(page, /input\.scrollWidth > input\.clientWidth \+ 1/);
  assert.match(page, /title=\{includeKeywordOverflowing \? includeKeyword : undefined\}/);
  assert.match(page, /title=\{excludeKeywordOverflowing \? excludeKeyword : undefined\}/);
  assert.match(page, /title=\{demandAgencyInputOverflowing \? demandAgencyInput : undefined\}/);
  assert.match(page, /const KEYWORD_HISTORY_LIMIT = 5/);
  assert.match(page, /className="keyword-history-list"/);
  assert.match(page, /aria-label="최근 포함키워드"/);
  assert.match(page, /aria-label="최근 제외키워드"/);
  assert.match(page, /aria-label="최근 수요기관"/);
  assert.match(page, /rememberKeywordHistory\("include", detailSnapshot\.includeKeyword\)/);
  assert.match(page, /rememberKeywordHistory\("exclude", detailSnapshot\.excludeKeyword\)/);
  assert.match(page, /rememberKeywordHistory\("demandAgency", detailSnapshot\.demandAgencyInput\)/);
  assert.match(page, /value\.trim\(\)\.replace\(\/\[,，\]\+\$\/, ""\)\.trim\(\)/);
  assert.match(page, /const deleteKeywordHistory = \(/);
  assert.match(page, /className="keyword-history-delete"/);
  assert.match(page, /deleteKeywordHistory\("include", value\)/);
  assert.match(page, /deleteKeywordHistory\("exclude", value\)/);
  assert.match(page, /deleteKeywordHistory\("demandAgency", value\)/);
  assert.match(page, /demandAgencies: splitDemandAgencies\(snapshot\.demandAgencyInput\)/);
  assert.match(page, /placeholder="조달청, 한국소비자원"/);
  assert.match(page, /const displayedAgencyNames = detail\.topLevelAgencyNames\.slice\(0, 2\)/);
  assert.match(page, /displayedAgencyNames\.join\(", "\)/);
  assert.match(page, /detail\.topLevelAgencyCount > displayedAgencyNames\.length \? ", \.\.\." : ""/);
  assert.match(page, /aria-label=\{`\$\{option\.name\} 세부 기관 목록`\}/);
  assert.match(page, /tabIndex=\{0\}/);
  assert.match(page, /role="tooltip"/);
  assert.match(page, /전체 기관은 다른 기관종류와 함께 선택되지 않습니다/);
  assert.match(page, /className="profile-region-options"/);
  assert.match(page, /role="group"/);
  assert.match(page, /aria-pressed=\{selected\}/);
  assert.match(page, /복수 선택할 수 있습니다/);
  assert.match(page, /제외 사업 분야/);
  assert.match(bids, /export type CompanyProfile/);
  assert.match(bids, /serviceRegions: \["전체 지역"\]/);
  assert.match(bids, /serviceAgencyTypes: \["전체 기관"\]/);
  assert.match(css, /\.app-shell \.profile-form/);
  assert.match(css, /\.app-shell \.profile-modal[\s\S]*?max-height: calc\(100dvh - 40px\)/);
  assert.match(css, /\.profile-modal::\-webkit-scrollbar-track[\s\S]*?margin-block: 15px/);
  assert.match(css, /\.app-shell \.profile-field/);
  assert.match(css, /\.app-shell \.profile-region-options/);
  assert.match(css, /\.app-shell \.profile-agency-type-options/);
  assert.match(css, /\.profile-agency-type-option:hover \.profile-agency-type-tooltip/);
  assert.match(css, /\.profile-agency-type-tooltip::after/);
  assert.match(css, /pointer-events: auto/);
  assert.match(css, /button\[aria-pressed="true"\]/);
  assert.match(css, /\.app-shell \.profile-form-actions/);
});

test("프로필과 검색 정보를 파일로 내보내고 다른 브라우저에서 가져온다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const USER_DATA_FORMAT = "findbid-user-data"/);
  assert.match(page, /const USER_DATA_VERSION = 1/);
  assert.match(page, /const USER_DATA_FILE_SIZE_LIMIT = 1024 \* 1024/);
  assert.match(page, /function parseUserDataBundle\(value: unknown\)/);
  assert.match(page, /function normalizeImportedSavedSearches\(value: unknown\)/);
  assert.match(page, /function mergeImportedHistory\(imported: string\[\], current: string\[\], limit: number\)/);
  assert.match(page, /const exportUserData = \(\) =>/);
  assert.match(page, /const importUserData = async \(event: React\.ChangeEvent<HTMLInputElement>\) =>/);
  assert.match(page, /companyProfile,[\s\S]*?savedSearches,[\s\S]*?recentSearches:/);
  assert.match(page, /new Blob\(\[JSON\.stringify\(bundle, null, 2\)\]/);
  assert.match(page, /findbid-내정보-/);
  assert.match(page, /storageBackup/);
  assert.match(page, /window\.localStorage\.setItem\(key, value\)/);
  assert.match(page, /companyProfileRef\.current = imported\.companyProfile/);
  assert.match(page, /body: JSON\.stringify\(imported\.companyProfile\)/);
  assert.match(page, /onClick=\{exportUserData\}[\s\S]*?내 정보 내보내기/);
  assert.match(page, /"내 정보 들여오기"/);
  assert.match(page, /accept="\.json,application\/json"/);
  assert.match(page, /기업 정보와 검색 기록이 포함되므로 안전한 곳에 보관하세요/);
  assert.match(
    page,
    /id="profile-excluded-areas"[\s\S]*?className="profile-form-help"[\s\S]*?className="profile-data-transfer"/,
  );
  assert.match(css, /\.app-shell \.profile-data-transfer\s*\{/);
  assert.match(css, /\.app-shell \.profile-data-transfer-actions/);
  assert.match(css, /\.app-shell \.profile-data-file-input\s*\{[\s\S]*?display:\s*none/);
});

test("관리페이지에서 DB 사용자 검색 피드백 기록을 조회하고 삭제한다", async () => {
  const [adminPage, activityPage, css, activityRoute, activityUserRoute, activitySearchRoute, activityFeedbackRoute] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/activity-logs/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/activity-logs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/activity-users/[sessionHash]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/activity-searches/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/activity-feedback/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(adminPage, /href="\/admin\/activity-logs">DB 활동로그/);
  assert.doesNotMatch(adminPage, /fetch\("\/api\/admin\/activity-logs"/);
  assert.match(activityPage, /사용자·AI 검색·피드백 기록/);
  assert.match(activityPage, /사용자·기업프로필/);
  assert.match(activityPage, /AI 검색 이력/);
  assert.match(activityPage, /추천 피드백/);
  assert.match(activityPage, /로그 새로고침/);
  assert.match(activityPage, /const ACTIVITY_PAGE_SIZE = 15/);
  assert.match(activityPage, /pageSize: String\(ACTIVITY_PAGE_SIZE\)/);
  assert.match(activityPage, /activitySequence/);
  assert.match(activityPage, /<th>순번<\/th>/);
  assert.match(activityPage, /admin-activity-pagination/);
  assert.match(activityPage, />이전<\/button>/);
  assert.match(activityPage, />다음<\/button>/);
  assert.match(activityPage, /type ActivityDetailModal/);
  assert.match(activityPage, /role="dialog"/);
  assert.match(activityPage, /aria-modal="true"/);
  assert.match(activityPage, /사용자·기업프로필 조회관리/);
  assert.match(activityPage, /AI 검색조건/);
  assert.match(activityPage, /직접 입력/);
  assert.match(activityPage, /입력한 검색조건/);
  assert.match(activityPage, /항목 선택/);
  assert.match(activityPage, /선택한 상세조건/);
  assert.match(activityPage, /선택한 상세조건[\s\S]*?입력한 검색조건/);
  assert.match(activityPage, />조회관리<\/button>/);
  assert.match(activityPage, /<th>검색결과<\/th>/);
  assert.match(activityPage, /공고 요약 \{searchResultCount\(search\.resultSummary\)\.toLocaleString\("ko-KR"\)\}건/);
  assert.match(activityPage, /function searchConditionPreview/);
  assert.match(activityPage, /const conditionValues = \[\.\.\.conditionPreview\.input, \.\.\.conditionPreview\.selected\]/);
  assert.match(activityPage, /className="admin-activity-condition-values"/);
  assert.match(activityPage, /conditionValues\.join\(" · "\)/);
  assert.match(activityPage, /className="admin-activity-condition-values empty"[\s\S]*?전체 조건/);
  assert.match(activityPage, /수요기관명/);
  assert.match(activityPage, /최대 사업금액/);
  assert.match(activityPage, /AI 검색결과 요약/);
  assert.match(activityPage, /기업 기본정보/);
  assert.match(activityPage, /보유 면허·자격/);
  assert.match(activityPage, /수행 가능 기관유형/);
  assert.match(activityPage, /개발정보 보기/);
  assert.match(activityPage, /추천 공고 요약/);
  assert.match(activityPage, /admin-activity-result-table/);
  assert.match(activityPage, /document\.body\.style\.overflow = "hidden"/);
  assert.doesNotMatch(activityPage, /<td><details><summary>상세/);
  assert.match(activityPage, /deleteActivityUser/);
  assert.match(activityPage, /deleteSearchPage/);
  assert.match(activityPage, /AI 검색이력 \$\{pages\.searches\}페이지의/);
  assert.match(activityPage, /사용자·기업프로필과 추천 피드백은 삭제되지 않습니다/);
  assert.match(activityPage, /JSON\.stringify\(\{ ids: searches\.map\(\(search\) => search\.id\) \}\)/);
  assert.match(activityPage, /현재 페이지 삭제/);
  assert.match(activityPage, /deleteFeedbackPage/);
  assert.match(activityPage, /추천 피드백 \$\{pages\.feedback\}페이지의/);
  assert.match(activityPage, /사용자·기업프로필과 AI 검색이력은 삭제되지 않습니다/);
  assert.match(activityPage, /JSON\.stringify\(\{ ids: feedback\.map\(\(item\) => item\.id\) \}\)/);
  assert.match(activityRoute, /new URLSearchParams/);
  assert.match(activityRoute, /\/api\/v1\/admin\/activity-logs\?\$\{query\}/);
  assert.match(activityUserRoute, /method: "DELETE"/);
  assert.match(activitySearchRoute, /export async function DELETE\(request: Request\)/);
  assert.match(activitySearchRoute, /\/api\/v1\/admin\/activity-searches/);
  assert.match(activityFeedbackRoute, /export async function DELETE\(request: Request\)/);
  assert.match(activityFeedbackRoute, /\/api\/v1\/admin\/activity-feedback/);
  assert.match(css, /\.admin-tabs/);
  assert.match(css, /\.admin-activity-subtabs/);
  assert.match(css, /\.admin-activity-table/);
  assert.match(css, /\.admin-activity-pagination/);
  assert.match(css, /\.admin-activity-list-actions/);
  assert.match(css, /\.admin-activity-modal-backdrop/);
  assert.match(css, /\.admin-activity-modal-content/);
  assert.match(css, /\.admin-activity-modal-identity/);
  assert.match(css, /\.admin-activity-modal-metrics/);
  assert.match(css, /\.admin-activity-tags/);
  assert.match(css, /\.admin-activity-tag-section \.admin-activity-tags span\s*\{[\s\S]*?background: transparent;[\s\S]*?border: 0;[\s\S]*?padding: 0;/);
  assert.match(css, /\.admin-activity-modal-footer/);
  assert.match(css, /\.admin-activity-condition-group\.input/);
  assert.match(css, /\.admin-activity-condition-group\.selected/);
  assert.match(css, /\.admin-activity-selected-conditions/);
  assert.match(css, /\.admin-activity-condition-group\s*\{[\s\S]*?padding: 6px 18px 18px;/);
  assert.match(css, /\.admin-activity-view-button\s*\{[\s\S]*?background: transparent;[\s\S]*?border: 0;/);
  assert.match(css, /\.admin-activity-condition-values/);
  assert.match(css, /\.admin-activity-condition-values:hover/);
  assert.match(css, /\.admin-activity-condition-group-head\s*\{[\s\S]*?align-items: center;/);
});

test("관리페이지에서 나라장터 수요기관을 매일 동기화하고 조회한다", async () => {
  const [adminPage, activityPage, agencyPage, listRoute, syncRoute, syncHistoryRoute, clientMetadata, css] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/activity-logs/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/demand-agencies/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/demand-agencies/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/demand-agencies/sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/demand-agencies/sync-history/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/client-metadata.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(adminPage, /href="\/admin\/demand-agencies">수요기관 관리/);
  assert.match(activityPage, /href="\/admin\/demand-agencies">수요기관 관리/);
  assert.match(agencyPage, /나라장터 수요기관 관리/);
  assert.match(agencyPage, /하루 한 번 최신 기관 변경정보/);
  assert.doesNotMatch(agencyPage, /최신 수요기관 가져오기/);
  assert.match(agencyPage, /수요기관 정보 가져오기/);
  assert.match(agencyPage, /completedToday\(latestSuccess\) \? "오늘 동기화 완료" : "최근 완료"/);
  assert.match(agencyPage, /window\.confirm\("최근 7일의 수요기관 등록·변경 정보를 다시 가져오시겠습니까\?"\)/);
  assert.match(agencyPage, /\/api\/admin\/demand-agencies\/sync\?force=true/);
  assert.match(agencyPage, /관리자 강제 실행/);
  assert.match(agencyPage, /const \[syncMessageRunId, setSyncMessageRunId\] = useState<number \| null>\(null\)/);
  assert.match(agencyPage, /data\.sync\.history\.find\(\(item\) => item\.id === syncMessageRunId\)/);
  assert.match(agencyPage, /run && run\.status !== "running"/);
  assert.match(agencyPage, /setMessage\(""\)/);
  assert.match(agencyPage, /기관명·기관코드·최상위기관 검색/);
  assert.match(agencyPage, /기관종류/);
  assert.match(agencyPage, /기관세부유형/);
  assert.match(agencyPage, /동기화 실행 이력/);
  assert.match(agencyPage, /<th>실행 IP<\/th>/);
  assert.match(agencyPage, /displaySyncRequestIp\(run\.requestIp\)/);
  assert.match(agencyPage, /return "127\.0\.0\.1 \(로컬\)"/);
  assert.match(syncRoute, /clientMetadataHeaders\(request\)/);
  assert.match(clientMetadata, /firstForwardedAddress\(forwardedFor\)/);
  assert.match(clientMetadata, /isDockerBridgeGateway\(clientIp\)/);
  assert.match(clientMetadata, /clientIp = "127\.0\.0\.1"/);
  assert.match(agencyPage, /동기화 실행 이력을 모두 삭제하시겠습니까/);
  assert.match(agencyPage, /수요기관 데이터는 삭제되지 않습니다/);
  assert.match(agencyPage, /\/api\/admin\/demand-agencies\/sync-history/);
  assert.match(agencyPage, /historyDeleting \|\| Boolean\(data\.sync\.running\) \|\| data\.sync\.history\.length === 0/);
  assert.match(agencyPage, /historyDeleting \? "삭제 중\.\.\." : "전체 삭제"/);
  assert.match(syncHistoryRoute, /export async function DELETE\(request: Request\)/);
  assert.match(syncHistoryRoute, /\/api\/v1\/admin\/demand-agencies\/sync-history/);
  assert.match(agencyPage, /window\.setInterval\(\(\) => void loadAgencies\(\), 3000\)/);
  assert.match(agencyPage, /const PAGE_JUMP = 5/);
  assert.match(agencyPage, /Math\.max\(1, page - PAGE_JUMP\)/);
  assert.match(agencyPage, /Math\.min\(data\.pagination\.totalPages, page \+ PAGE_JUMP\)/);
  assert.match(agencyPage, />페이지 시작<\/button>/);
  assert.match(agencyPage, />이전 5페이지<\/button>/);
  assert.match(agencyPage, />다음 5페이지<\/button>/);
  assert.match(agencyPage, />페이지 끝<\/button>/);
  assert.match(listRoute, /\/api\/v1\/admin\/demand-agencies\?\$\{query\}/);
  assert.match(listRoute, /isAdminAuthenticated/);
  assert.match(syncRoute, /method: "POST"/);
  assert.match(syncRoute, /\/api\/v1\/admin\/demand-agencies\/sync\?force=\$\{force\}/);
  assert.match(css, /\.admin-agency-metrics/);
  assert.match(css, /\.admin-agency-table-wrap/);
  assert.match(css, /\.admin-sync-status\.running/);
  assert.equal((agencyPage.match(/className="admin-agency-import-button"/g) ?? []).length, 1);
  assert.match(css, /\.admin-agency-import-button\s*\{[\s\S]*?background:\s*#2f75e8;[\s\S]*?border-radius:\s*10px;[\s\S]*?min-height:\s*42px/);
  assert.doesNotMatch(css, /\.admin-agency-force-sync-button/);
  assert.match(css, /\.admin-agency-list-card > \.admin-activity-pagination\s*\{[\s\S]*?margin-bottom:\s*24px/);
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

test("인사이트 메뉴는 별도 페이지에서 시장과 기업 관점의 분석을 제공한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const insights = await readFile(
    new URL("../app/insights/page.tsx", import.meta.url),
    "utf8",
  );
  const [css, marketAnalyzer, marketRoute] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../../backend/app/market_insights.py", import.meta.url), "utf8"),
    readFile(new URL("../app/api/insights/market/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<a href="\/insights">/);
  assert.doesNotMatch(page, /id="insight"/);
  assert.doesNotMatch(page, /const insightData = useMemo/);
  assert.match(insights, /const insightData = useMemo/);
  assert.match(insights, />참여 기회 요약</);
  assert.match(insights, />기업 역량과 시장 수요 비교</);
  assert.match(insights, />입찰시장 동향</);
  assert.match(insights, />참여 제한 요인 분석</);
  assert.match(insights, />핫 키워드 동향</);
  assert.match(insights, /전체/);
  assert.match(insights, /업무구분별/);
  assert.match(insights, /지역별/);
  assert.match(insights, /금액대별/);
  assert.match(insights, /fetch\("\/api\/insights\/market"/);
  assert.match(insights, /최근 6개월 마감 공고 포함/);
  assert.match(insights, /최근 30일과 직전 30일/);
  assert.match(insights, /제목 위치·분류 일치·문맥 응집도/);
  assert.match(
    marketAnalyzer,
    /IGNORED_KEYWORDS[\s\S]*?"학년도"[\s\S]*?"구매"[\s\S]*?"도입"[\s\S]*?"운영"[\s\S]*?"단계"/,
  );
  assert.doesNotMatch(marketAnalyzer, /"구매": "구매·도입"/);
  assert.match(marketAnalyzer, /recent_start = period_end - timedelta\(days=30\)/);
  assert.match(marketRoute, /insights\/market\?months=6/);
  assert.match(insights, /className="active" href="\/insights" aria-current="page"/);
  assert.match(insights, /const INSIGHT_PAGE_SIZE = 200/);
  assert.match(insights, /const INSIGHTS_LOADING_DELAY_MS = 100/);
  assert.match(insights, /const RESTRICTION_TARGET_SIZE = 1_000/);
  assert.match(insights, /6개월 데이터 분석 중/);
  assert.match(insights, /className="insights-loading-layer"/);
  assert.match(insights, /className="insights-loading-card"/);
  assert.match(insights, /입찰 인사이트를 분석하고 있습니다/);
  assert.match(insights, /window\.setTimeout\([\s\S]*?setShowInsightsLoadingLayer\(true\)[\s\S]*?INSIGHTS_LOADING_DELAY_MS/);
  assert.match(insights, /window\.clearTimeout\(timer\)/);
  assert.match(insights, /showInsightsLoadingLayer &&/);
  assert.match(css, /\.app-shell \.insights-loading-layer\s*\{[\s\S]*?backdrop-filter:\s*blur\(4px\);[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*130;/);
  assert.match(css, /\.app-shell \.insights-loading-card/);
  assert.equal((insights.match(/sortMode: "latest"/g) ?? []).length, 1);
  assert.match(css, /\.app-shell \.insight-dashboard/);
  assert.match(css, /\.app-shell \.insights-main/);
  assert.match(css, /\.app-shell \.insight-grid/);
  assert.match(css, /\.app-shell \.demand-list/);
  assert.match(css, /\.app-shell \.market-bars/);
  assert.match(css, /\.app-shell \.hot-keyword-chart/);
  assert.match(css, /\.app-shell \.hot-keyword-insight\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(css, /\.app-shell \.hot-keyword-bar i\s*\{[\s\S]*?linear-gradient/);
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

test("알림 메뉴는 관리자 게시물과 연결된 접근 가능한 팝업을 제공한다", async () => {
  const [home, insights, notifications, popup, admin, publicRoute, adminRoute, itemRoute, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/notifications/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_components/notification-popup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/notifications/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/notifications/[notificationId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(home, /<NotificationPopup open=\{notificationsOpen\} onClose=\{closeNotifications\} \/>/);
  assert.match(insights, /<NotificationPopup open=\{notificationsOpen\} onClose=\{closeNotifications\} \/>/);
  assert.match(home, /setNotificationsOpen\(true\)/);
  assert.match(insights, /setNotificationsOpen\(true\)/);
  assert.match(popup, /role="dialog"/);
  assert.match(popup, /aria-modal="true"/);
  assert.match(popup, /event\.key === "Escape"/);
  assert.match(popup, /event\.target === event\.currentTarget/);
  assert.match(popup, /fetch\("\/api\/notifications"/);
  assert.match(popup, /<th scope="col">게시일시<\/th><th scope="col">게시자<\/th><th scope="col">내용<\/th>/);
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
  assert.match(css, /\.app-shell \.notification-popup-backdrop/);
  assert.match(css, /\.app-shell \.notification-popup\s*\{/);
  assert.match(css, /\.admin-notification-control/);
});

test("공통 Footer와 세 개의 공개 안내 페이지를 제공한다", async () => {
  const [home, insights, footer, about, privacy, terms, css, viteConfig, nextConfig, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/_components/site-footer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/about/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/terms/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(home, /<SiteFooter \/>/);
  assert.match(insights, /<SiteFooter \/>/);
  assert.match(footer, /© 2026 INTERWEB\. All rights reserved\./);
  assert.match(footer, /Ver\. \{APP_VERSION\}/);
  assert.match(footer, /className="site-footer-bottom"[\s\S]*?All rights reserved[\s\S]*?className="site-footer-release"/);
  assert.match(footer, /const RELEASED_AT = packageJson\.releaseDate/);
  assert.match(footer, /process\.env\.NODE_ENV === "production" \? "Rel" : "Dev"/);
  assert.match(footer, /localDateTime/);
  assert.doesNotMatch(nextConfig, /NEXT_PUBLIC_FINDBID_RELEASED_AT/);
  assert.doesNotMatch(viteConfig, /NEXT_PUBLIC_FINDBID_RELEASED_AT/);
  const packageMetadata = JSON.parse(packageJson);
  assert.equal(typeof packageMetadata.version, "string");
  assert.equal(Number.isNaN(Date.parse(packageMetadata.releaseDate)), false);
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
  assert.match(terms, /추천 입찰공고는 현재 제공된 정보에 근거하여 AI가 분석한 결과를 기반으로 제공되며, 실제 입찰 결과와 다를 수 있습니다/);
  assert.match(css, /\.app-shell \.site-footer/);
  assert.match(css, /\.app-shell \.site-footer-release/);
  assert.match(css, /\.app-shell \.site-footer-bottom\s*\{[\s\S]*?align-items:\s*baseline/);
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
