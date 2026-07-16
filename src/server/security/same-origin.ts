export function isSameOriginMutation(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const supplied = new URL(origin);
    return expectedOrigins(request).has(supplied.origin);
  } catch {
    return false;
  }
}

function expectedOrigins(request: Request) {
  const origins = new Set<string>();
  const requestUrl = new URL(request.url);
  addOrigin(origins, process.env.PAPERVARD_PUBLIC_URL);
  addOrigin(origins, requestUrl.origin);

  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto")) ?? requestUrl.protocol.slice(0, -1);
  if (forwardedHost) addOrigin(origins, `${forwardedProto}://${forwardedHost}`);

  const host = firstHeaderValue(request.headers.get("host"));
  if (host) addOrigin(origins, `${forwardedProto}://${host}`);
  return origins;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || undefined;
}

function addOrigin(origins: Set<string>, value: string | undefined) {
  if (!value) return;
  try {
    origins.add(new URL(value).origin);
  } catch {
    // Invalid optional proxy configuration is ignored; other candidates remain available.
  }
}
