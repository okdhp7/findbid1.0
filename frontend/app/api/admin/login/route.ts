import {
  adminLoginCookie,
  passwordMatches,
} from "../admin-auth";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { password?: unknown };
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!passwordMatches(password)) {
    return Response.json(
      { authenticated: false, message: "관리자 비밀번호가 올바르지 않습니다." },
      { status: 401 },
    );
  }
  return new Response(
    JSON.stringify({ authenticated: true }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": await adminLoginCookie(),
      },
    },
  );
}
