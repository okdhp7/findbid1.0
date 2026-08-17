function firstForwardedAddress(value: string): string {
  return value.split(",")[0]?.trim() ?? "";
}

function isDockerBridgeGateway(value: string): boolean {
  return /^172\.(?:1[6-9]|2\d|3[01])\.0\.1$/.test(value)
    || value === "192.168.65.1";
}

export function clientMetadataHeaders(request: Request): Record<string, string> {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  let clientIp = (
    request.headers.get("cf-connecting-ip")
    || firstForwardedAddress(forwardedFor)
    || request.headers.get("x-real-ip")
    || ""
  ).trim();
  const hostname = new URL(request.url).hostname;
  if (
    ["localhost", "127.0.0.1", "::1"].includes(hostname)
    && isDockerBridgeGateway(clientIp)
  ) {
    clientIp = "127.0.0.1";
  }
  return {
    "x-client-ip": clientIp,
    "x-client-user-agent": request.headers.get("user-agent") ?? "",
  };
}
