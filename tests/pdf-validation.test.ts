import { describe, expect, it } from "vitest";
import { hasPdfSignature } from "@/server/pdf/validate";

describe("PDF signature validation", () => {
  it("accepts a PDF header and rejects renamed non-PDF data", () => {
    expect(hasPdfSignature(Buffer.from("%PDF-1.7\n"))).toBe(true);
    expect(hasPdfSignature(Buffer.from("<html>not a pdf</html>"))).toBe(false);
  });
});
