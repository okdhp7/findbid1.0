const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";

export async function GET(
  _request: Request,
  context: { params: Promise<{ bidId: string }> },
) {
  try {
    const { bidId } = await context.params;
    const response = await fetch(
      `${backendUrl}/api/v1/bids/${encodeURIComponent(bidId)}`,
      { cache: "no-store" },
    );
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({
        detail: "입찰공고 상세정보 백엔드에 연결할 수 없습니다.",
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      },
    );
  }
}
