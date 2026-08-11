import { isAdminAuthenticated } from "../../admin-auth";

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
const internalApiKey = process.env.INTERNAL_API_KEY ?? "change-this-in-production";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated(request))) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  try {
    const requestUrl = new URL(request.url);
    const force = requestUrl.searchParams.get("force") === "true";
    const response = await fetch(`${backendUrl}/api/v1/admin/demand-agencies/sync?force=${force}`, {
      method: "POST",
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
      { detail: "수요기관 정보 가져오기를 시작할 수 없습니다." },
      { status: 503 },
    );
  }
}
