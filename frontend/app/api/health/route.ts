const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";

export async function GET() {
  let backend = "연결 안 됨";
  try {
    const response = await fetch(`${backendUrl}/api/v1/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    backend = response.ok ? "정상" : "오류";
  } catch {
    backend = "연결 안 됨";
  }

  return new Response(
    JSON.stringify({
      status: "정상",
      service: "FindBid Frontend",
      backend,
      timestamp: new Date().toISOString(),
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
