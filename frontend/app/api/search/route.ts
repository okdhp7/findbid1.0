import { anonymousSession } from "../anonymous-session";
import { clientMetadataHeaders } from "../client-metadata";

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";

export async function POST(request: Request) {
  const { sessionId, setCookie } = anonymousSession(request);
  try {
    const payload = await request.json();
    const response = await fetch(`${backendUrl}/api/v1/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-session-id": sessionId,
        ...clientMetadataHeaders(request),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = await response.text();
    const headers = new Headers({
      "content-type": "application/json; charset=utf-8",
    });
    if (setCookie) headers.set("set-cookie", setCookie);
    return new Response(body, { status: response.status, headers });
  } catch {
    return new Response(
      JSON.stringify({
        detail: "검색 백엔드에 연결할 수 없습니다.",
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
