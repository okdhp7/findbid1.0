const SESSION_COOKIE = "findbid_feedback_session";
const SESSION_TTL_SECONDS = 7200;
const SESSION_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;

function cookieValue(request: Request, name: string): string {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return "";
}

export function anonymousSession(request: Request) {
  const stored = cookieValue(request, SESSION_COOKIE);
  const sessionId = SESSION_PATTERN.test(stored)
    ? stored
    : crypto.randomUUID().replaceAll("-", "");
  return {
    sessionId,
    setCookie: stored === sessionId
      ? ""
      : [
          `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
          "Path=/",
          "HttpOnly",
          "SameSite=Lax",
          `Max-Age=${SESSION_TTL_SECONDS}`,
          process.env.NODE_ENV === "production" ? "Secure" : "",
        ].filter(Boolean).join("; "),
  };
}
