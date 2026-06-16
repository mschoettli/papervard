import { describe, expect, it } from "vitest";
import { detectYear } from "@/server/pdf/year";

describe("detectYear", () => {
  it("detects a year from filenames", () => {
    expect(detectYear("report-2023-final.pdf", 2026)).toBe(2023);
  });

  it("uses fallback when no year is present", () => {
    expect(detectYear("scan.pdf", 2024)).toBe(2024);
  });
});
