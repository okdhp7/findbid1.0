import { isAdminAuthenticated } from "../../admin-auth";

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
const internalApiKey = process.env.INTERNAL_API_KEY ?? "change-this-in-production";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ sessionHash: string }> },
) {
  if (!(await isAdminAuthenticated(request))) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  const { sessionHash } = await context.params;
  try {
    const response = await fetch(
      `${backendUrl}/api/v1/admin/activity-users/${encodeURIComponent(sessionHash)}`,
      {
        method: "DELETE",
        headers: { "x-internal-key": internalApiKey },
        cache: "no-store",
      },
    );
    return new Response(null, { status: response.status });
  } catch {
    return Response.json(
      { detail: "사용자 활동기록을 삭제할 수 없습니다." },
      { status: 503 },
    );
  }
}
