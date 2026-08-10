import { anonymousSession } from "../../anonymous-session";
import { clientMetadataHeaders } from "../../client-metadata";

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";

export async function POST(request: Request) {
  const { sessionId, setCookie } = anonymousSession(request);
  try {
    const payload = await request.json();
    const response = await fetch(`${backendUrl}/api/v1/company/profile`, {
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
    return Response.json(
      { detail: "기업 프로필을 서버에 저장할 수 없습니다." },
      { status: 503 },
    );
  }
}
