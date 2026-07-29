import { adminLogoutCookie } from "../admin-auth";

export async function POST() {
  return new Response(
    JSON.stringify({ authenticated: false }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": adminLogoutCookie(),
      },
    },
  );
}
