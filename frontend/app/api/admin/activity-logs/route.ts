import { isAdminAuthenticated } from "../admin-auth";

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
const internalApiKey = process.env.INTERNAL_API_KEY ?? "change-this-in-production";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated(request))) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  try {
    const requestUrl = new URL(request.url);
    const query = new URLSearchParams({
      type: requestUrl.searchParams.get("type") ?? "users",
      page: requestUrl.searchParams.get("page") ?? "1",
      pageSize: requestUrl.searchParams.get("pageSize") ?? "15",
    });
    const response = await fetch(`${backendUrl}/api/v1/admin/activity-logs?${query}`, {
      headers: { "x-internal-key": internalApiKey },
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
      { detail: "DB 활동로그를 조회할 수 없습니다." },
      { status: 503 },
    );
  }
}
