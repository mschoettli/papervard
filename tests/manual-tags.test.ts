import { describe, expect, it } from "vitest";
import { normalizeTagColor, normalizeTagName } from "@/server/documents/tags";

describe("manual tags", () => {
  it("normalizes whitespace without changing the user's spelling", () => {
    expect(normalizeTagName("  Kranken   Kasse  ")).toBe("Kranken Kasse");
  });

  it("accepts safe hex colors and falls back for malformed values", () => {
    expect(normalizeTagColor("#0f766e")).toBe("#0f766e");
    expect(normalizeTagColor("javascript:alert(1)")).toBe("#64748b");
  });
});
