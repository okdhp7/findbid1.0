import { isAdminAuthenticated } from "../admin-auth";

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
const internalApiKey = process.env.INTERNAL_API_KEY ?? "change-this-in-production";

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated(request))) {
    return Response.json(
      { authenticated: false },
      { status: 401 },
    );
  }
  try {
    const payload = await request.json();
    const response = await fetch(
      `${backendUrl}/api/v1/admin/recommendation/feedback-settings`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-internal-key": internalApiKey,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );
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
      { detail: "추천 피드백 설정을 변경할 수 없습니다." },
      { status: 503 },
    );
  }
}
