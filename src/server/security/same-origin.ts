export function isSameOriginMutation(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const expected = new URL(process.env.PAPERVARD_PUBLIC_URL || request.url);
    const supplied = new URL(origin);
    return expected.protocol === supplied.protocol && expected.host === supplied.host;
  } catch {
    return false;
  }
}
