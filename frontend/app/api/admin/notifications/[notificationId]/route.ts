import { isAdminAuthenticated } from "../../admin-auth";

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
const internalApiKey = process.env.INTERNAL_API_KEY ?? "change-this-in-production";

async function proxy(
  request: Request,
  context: { params: Promise<{ notificationId: string }> },
  method: "PUT" | "DELETE",
) {
  if (!(await isAdminAuthenticated(request))) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  try {
    const { notificationId } = await context.params;
    const response = await fetch(
      `${backendUrl}/api/v1/admin/notifications/${encodeURIComponent(notificationId)}`,
      {
        method,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-internal-key": internalApiKey,
        },
        body: method === "PUT" ? await request.text() : undefined,
        cache: "no-store",
      },
    );
    if (response.status === 204) return new Response(null, { status: 204 });
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
      { detail: "알림 게시물을 처리할 수 없습니다." },
      { status: 503 },
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ notificationId: string }> },
) {
  return proxy(request, context, "PUT");
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ notificationId: string }> },
) {
  return proxy(request, context, "DELETE");
}
