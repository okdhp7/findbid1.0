const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const limit = url.searchParams.get("limit") ?? "10";
  try {
    const response = await fetch(
      `${backendUrl}/api/v1/company/agency-suggestions?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`,
      { cache: "no-store" },
    );
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch {
    return new Response(
      JSON.stringify({ detail: "수요기관 검색 정보를 불러올 수 없습니다." }),
      {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }
}
