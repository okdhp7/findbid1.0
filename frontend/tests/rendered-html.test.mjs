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
  assert.match(page, /className="apply-button"[\s\S]*?onClick=\{openSaveSearch\}[\s\S]*?검색조건 저장/);
  assert.doesNotMatch(page, /className="save-search"/);
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
});

test("관심공고를 브라우저에 저장하고 별도 목록으로 표시한다", async () => {
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
  assert.match(page, /const toggleSaved = \(bid: Bid\) =>/);
  assert.match(page, /id="saved"/);
  assert.match(page, /aria-labelledby="saved-bids-title"/);
  assert.match(page, /aria-label=\{`관심공고 \$\{saved\.length\}건`\}/);
  assert.match(page, /\{saved\.length > 0 && <em>\{saved\.length\}<\/em>\}/);
  assert.match(page, /const scrollToSavedBids = \(\) =>/);
  assert.match(page, /target\.scrollIntoView\(\{/);
  assert.match(page, /className="icon-button saved-bids-header-button"/);
  assert.match(page, /onClick=\{scrollToSavedBids\}/);
  assert.match(page, /aria-label=\{`관심공고 \$\{saved\.length\}건 보기`\}/);
  assert.match(page, /savedBids\.map\(\(bid\) =>/);
  assert.match(page, /공고 카드의 마름모 버튼을 누르면 이곳에 저장됩니다/);
  assert.match(page, /onClick=\{\(\) => void openNoticeDetail\(bid\)\}/);
  assert.match(page, /className="saved-bid-score-badge">[\s\S]*?적합도 \{bid\.score\}점/);
  assert.match(page, /className="saved-bid-fact-region">[\s\S]*?참가 지역[\s\S]*?<strong>\{bid\.region\}<\/strong>/);
  assert.match(page, /className="saved-bid-fact-deadline">[\s\S]*?마감일시[\s\S]*?<strong>\{bid\.closeAt\}<\/strong>/);
  assert.doesNotMatch(page, /saved-bid-fact-wide/);
  assert.match(css, /\.app-shell \.saved-bids-section/);
  assert.match(css, /\.app-shell \.saved-bids-list/);
  assert.match(css, /\.app-shell \.saved-bid-card/);
  assert.match(css, /\.app-shell \.saved-bid-meta \.saved-bid-score-badge/);
  assert.match(css, /\.mobile-dock em/);
  assert.match(css, /\.saved-bids-header-button i/);
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
  assert.match(page, /className="search-trace-panel"/);
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
  assert.match(css, /\.app-shell \.bid-sequence/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  const sequenceStyle = css.match(/\.app-shell \.bid-sequence\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(sequenceStyle, /color:\s*var\(--muted\)/);
  assert.doesNotMatch(sequenceStyle, /\bbackground\s*:/);
  assert.doesNotMatch(sequenceStyle, /\bborder(?:-radius)?\s*:/);
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
  assert.match(page, /점수 신뢰도 \{selected\.scoreConfidence \?\? 0\}%/);
  assert.match(page, /적합도 산정 근거/);
  assert.match(page, /Object\.entries\(selected\.scoreBreakdown \?\? \{\}\)/);
  assert.match(page, /selected\.scoreReasons/);
  assert.doesNotMatch(page, /<strong>87<em>점<\/em><\/strong>/);
  assert.match(css, /\.app-shell \.score-breakdown/);
  assert.match(css, /\.app-shell \.score-confidence/);
});

test("공고 카드에 일치 역량과 속성 검색조건을 구분해 표시한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /bid\.matched\.length > 0/);
  assert.match(page, /bid\.matched\.map\(\(item\) =>/);
  assert.match(page, /bid\.matchedConditions \?\? \[\]/);
  assert.match(page, /\(bid\.matchedConditions \?\? \[\]\)\.map\(\(item\) =>/);
  assert.match(page, /검색조건/);
  assert.match(page, /일치하는 검색조건/);
  assert.match(page, />✓ \{item\}</);
  const matchedItemStyle = css.match(
    /\.app-shell \.match-group span:not\(\.match-label\)\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const matchedLabelStyle = css.match(
    /\.app-shell \.match-label\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  assert.match(matchedLabelStyle, /color:\s*var\(--accent\)/);
  assert.match(matchedLabelStyle, /font-weight:\s*400/);
  assert.match(matchedItemStyle, /background:\s*transparent/);
  assert.match(matchedItemStyle, /border:\s*0/);
  assert.match(matchedItemStyle, /color:\s*var\(--accent\)/);
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

test("금액 항목 명칭은 사업금액으로 통일한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.equal((page.match(/>사업금액<\/(?:span|label)>/g) ?? []).length, 4);
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

test("FindBid 로고는 입찰정보 검색을 상징하는 고급형 SVG 워드마크를 사용한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /id="findbid-logo-gradient"/);
  assert.match(page, /className="logo-bid-mark"[^>]*>Bid<\/text>/);
  assert.match(page, /className="logo-lens"/);
  assert.match(page, /className="logo-lens-handle"/);
  assert.match(page, /className="word-find">Find/);
  assert.match(page, /className="word-bid">Bid/);
  assert.match(page, /AI Bid Searcher/);
  assert.doesNotMatch(page, /<span className="logo-symbol">F<\/span>/);
  assert.doesNotMatch(page, /className="logo-f"/);
  assert.doesNotMatch(page, /className="logo-gavel"/);
  assert.match(css, /\.app-shell \.logo-bid-mark/);
  assert.match(css, /\.app-shell \.word-bid/);
  assert.match(css, /background-clip:\s*text/);
});
