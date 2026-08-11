import { isAdminAuthenticated } from "../admin-auth";

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
const internalApiKey = process.env.INTERNAL_API_KEY ?? "change-this-in-production";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated(request))) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const query = new URLSearchParams({
      page: url.searchParams.get("page") ?? "1",
      pageSize: url.searchParams.get("pageSize") ?? "20",
      q: url.searchParams.get("q") ?? "",
      jurisdictionType: url.searchParams.get("jurisdictionType") ?? "",
      detailType: url.searchParams.get("detailType") ?? "",
      status: url.searchParams.get("status") ?? "active",
    });
    const response = await fetch(`${backendUrl}/api/v1/admin/demand-agencies?${query}`, {
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
      { detail: "수요기관 정보를 조회할 수 없습니다." },
      { status: 503 },
    );
  }
}

