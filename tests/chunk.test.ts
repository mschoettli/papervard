import { describe, expect, it } from "vitest";
import { chunkPages } from "@/server/pdf/chunk";

describe("chunkPages", () => {
  it("keeps page references", () => {
    const chunks = chunkPages([{ page: 7, text: "hello ".repeat(500) }], 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.page === 7)).toBe(true);
  });
});
