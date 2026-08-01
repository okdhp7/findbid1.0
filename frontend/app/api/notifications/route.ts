const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";

export async function GET() {
  try {
    const response = await fetch(`${backendUrl}/api/v1/notifications?limit=100`, {
      cache: "no-store",
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { detail: "알림 목록을 불러올 수 없습니다." },
      { status: 503 },
    );
  }
}
