export function clientMetadataHeaders(request: Request): Record<string, string> {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const clientIp = (
    request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? forwardedFor.split(",")[0]
    ?? ""
  ).trim();
  return {
    "x-client-ip": clientIp,
    "x-client-user-agent": request.headers.get("user-agent") ?? "",
  };
}
