import { isAdminAuthenticated } from "../admin-auth";

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
const internalApiKey = process.env.INTERNAL_API_KEY ?? "change-this-in-production";

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated(request))) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  try {
    const body = await request.text();
    const response = await fetch(`${backendUrl}/api/v1/admin/activity-searches`, {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        "x-internal-key": internalApiKey,
      },
      body,
      cache: "no-store",
    });
    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { detail: "AI 검색이력을 삭제할 수 없습니다." },
      { status: 503 },
    );
  }
}
