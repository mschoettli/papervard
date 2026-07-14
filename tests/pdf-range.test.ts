import { describe, expect, it } from "vitest";
import { parseByteRange } from "@/server/http/byte-range";

describe("parseByteRange", () => {
  it("parses a bounded PDF range", () => {
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
  });

  it("supports an open ended range", () => {
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
  });

  it("rejects invalid and out of bounds ranges", () => {
    expect(parseByteRange("bytes=100-120", 100)).toBeNull();
    expect(parseByteRange("items=0-10", 100)).toBeNull();
  });
});
