import { isAdminAuthenticated } from "../admin-auth";

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
const internalApiKey = process.env.INTERNAL_API_KEY ?? "change-this-in-production";

async function proxy(request: Request, method: "GET" | "POST") {
  if (!(await isAdminAuthenticated(request))) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  try {
    const response = await fetch(`${backendUrl}/api/v1/admin/notifications`, {
      method,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-internal-key": internalApiKey,
      },
      body: method === "POST" ? await request.text() : undefined,
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
      { detail: "알림 게시물을 처리할 수 없습니다." },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  return proxy(request, "GET");
}

export async function POST(request: Request) {
  return proxy(request, "POST");
}
