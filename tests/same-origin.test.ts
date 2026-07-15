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
});
