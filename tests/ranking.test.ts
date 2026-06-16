import { describe, expect, it } from "vitest";
import { combineRank, makeExcerpt } from "@/server/search/ranking";

describe("search ranking", () => {
  it("combines keyword and semantic rank", () => {
    expect(combineRank(1, 0)).toBe(0.62);
    expect(combineRank(0, 1)).toBe(0.38);
  });

  it("creates focused excerpts", () => {
    const excerpt = makeExcerpt("alpha ".repeat(80) + "needle " + "omega ".repeat(80), "needle", 120);
    expect(excerpt).toContain("needle");
  });
});
