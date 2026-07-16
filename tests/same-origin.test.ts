import { describe, expect, it } from "vitest";
import { isSameOriginMutation } from "@/server/security/same-origin";

describe("same-origin mutation guard", () => {
  it("rejects cross-site browser requests", () => {
    const request = new Request("https://papervard.test/api/uploads", {
      method: "POST",
      headers: { origin: "https://attacker.test", "sec-fetch-site": "cross-site" }
    });
    expect(isSameOriginMutation(request)).toBe(false);
  });

  it("accepts a matching browser origin and local non-browser calls", () => {
    expect(isSameOriginMutation(new Request("https://papervard.test/api/uploads", {
      method: "POST",
      headers: { origin: "https://papervard.test", "sec-fetch-site": "same-origin" }
    }))).toBe(true);
    expect(isSameOriginMutation(new Request("http://web:3000/api/uploads", { method: "POST" }))).toBe(true);
  });

  it("accepts the public Host origin when Docker exposes a different internal URL", () => {
    const request = new Request("http://app:3000/api/uploads", {
      method: "POST",
      headers: {
        host: "192.168.178.56:3003",
        origin: "http://192.168.178.56:3003",
        "sec-fetch-site": "same-origin"
      }
    });

    expect(isSameOriginMutation(request)).toBe(true);
  });

  it("accepts forwarded HTTPS origin while still rejecting a foreign origin", () => {
    const headers = {
      host: "app:3000",
      "x-forwarded-host": "papervard.example.test",
      "x-forwarded-proto": "https",
      "sec-fetch-site": "same-origin"
    };

    expect(isSameOriginMutation(new Request("http://app:3000/api/uploads", {
      method: "POST",
      headers: { ...headers, origin: "https://papervard.example.test" }
    }))).toBe(true);
    expect(isSameOriginMutation(new Request("http://app:3000/api/uploads", {
      method: "POST",
      headers: { ...headers, origin: "https://attacker.test" }
    }))).toBe(false);
  });
});
