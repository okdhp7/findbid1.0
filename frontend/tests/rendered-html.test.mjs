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

test("공고 목록 상단과 하단 이동 기능을 제공한다", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /resultTopRef/);
  assert.match(page, /resultBottomRef/);
  assert.match(page, /scrollIntoView/);
  assert.match(page, /공고 목록 상단으로 이동/);
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

test("상세조건 변경 시 자동 검색하고 조건 적용 버튼을 유지한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /new AbortController\(\)/);
  assert.match(page, /requestId !== searchRequestIdRef\.current/);
  assert.match(page, /scheduleDetailSearch\(/);
  assert.match(page, /includeKeyword: nextKeyword[\s\S]*?500/);
  assert.match(page, /excludeKeyword: nextKeyword[\s\S]*?500/);
  assert.match(page, /onClick=\{\(\) => \{ runSearchNow\(currentSearchSnapshot\(\)\); setFiltersOpen\(false\); \}\}/);
  assert.match(page, /조건 적용하기/);
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
  assert.equal((page.match(/>조건 기준<\/span>/g) ?? []).length, 3);
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
