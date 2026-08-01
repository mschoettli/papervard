import { describe, expect, it } from "vitest";
import { buildDocumentSelectionWhere, normalizeDocumentSelection } from "@/server/documents/bulk-selection";

describe("document bulk selection", () => {
  it("deduplicates explicit document ids", () => {
    expect(normalizeDocumentSelection({ mode: "explicit", ids: ["doc-1", "doc-1", "doc-2"] })).toEqual({
      mode: "explicit",
      ids: ["doc-1", "doc-2"]
    });
  });

  it("normalizes a query selection with exclusions", () => {
    expect(normalizeDocumentSelection({
      mode: "query",
      query: "  ÖKK Leistung  ",
      folderId: "health",
      scope: "family",
      year: 2026,
      tagIds: ["paid", "paid", "insurance"],
      excludeIds: ["doc-9", "doc-9"]
    })).toEqual({
      mode: "query",
      query: "ÖKK Leistung",
      folderId: "health",
      scope: "family",
      year: 2026,
      tagIds: ["paid", "insurance"],
      excludeIds: ["doc-9"]
    });
  });

  it("builds an access-bound query for folders, tags and exclusions", () => {
    const where = buildDocumentSelectionWhere(
      normalizeDocumentSelection({
        mode: "query",
        folderId: "health",
        scope: "favorites",
        year: 2026,
        tagIds: ["paid", "insurance"],
        excludeIds: ["doc-9"]
      }),
      { userId: "user-1", householdIds: ["house-1"], isAdmin: false },
      ["health", "okk"]
    );

    expect(where).toMatchObject({
      AND: expect.arrayContaining([
        { year: 2026 },
        { folderId: { in: ["health", "okk"] } },
        { id: { notIn: ["doc-9"] } },
        { tags: { some: { tagId: "paid" } } },
        { tags: { some: { tagId: "insurance" } } }
      ])
    });
    expect(JSON.stringify(where)).toContain('"favorites":{"some":{"userId":"user-1"}}');
  });
});
