const ADMIN_COOKIE = "findbid_admin_session";
const ADMIN_SESSION_SECONDS = 14400;
const textEncoder = new TextEncoder();

export function adminPassword(): string {
  const password = process.env.FINDBID_ADMIN_PASSWORD?.trim();
  if (!password) {
    throw new Error("FINDBID_ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.");
  }
  return password;
}

function cookieValue(request: Request, name: string): string {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return "";
}

async function adminToken(): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(adminPassword()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode("findbid-admin-session-v1"),
  );
  return Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function isAdminAuthenticated(request: Request): Promise<boolean> {
  return safeEqual(cookieValue(request, ADMIN_COOKIE), await adminToken());
}

export async function adminLoginCookie(): Promise<string> {
  return [
    `${ADMIN_COOKIE}=${await adminToken()}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${ADMIN_SESSION_SECONDS}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function adminLogoutCookie(): string {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function passwordMatches(value: string): boolean {
  return safeEqual(value, adminPassword());
}
