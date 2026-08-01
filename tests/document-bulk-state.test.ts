import { describe, expect, it } from "vitest";
import { initialBulkSelection, reduceBulkSelection, selectedDocumentCount } from "@/components/document-bulk-state";

describe("document bulk selection state", () => {
  it("selects the visible page and then expands to every result", () => {
    const page = reduceBulkSelection(initialBulkSelection, { type: "select-visible", ids: ["one", "two"] });
    expect(page).toEqual({ allResults: false, selectedIds: ["one", "two"], excludedIds: [] });
    const all = reduceBulkSelection(page, { type: "select-all-results" });
    expect(all).toEqual({ allResults: true, selectedIds: [], excludedIds: [] });
    expect(selectedDocumentCount(all, 386)).toBe(386);
  });

  it("tracks exclusions while all results are selected", () => {
    const all = { allResults: true, selectedIds: [], excludedIds: [] };
    const excluded = reduceBulkSelection(all, { type: "toggle", id: "two" });
    expect(excluded.excludedIds).toEqual(["two"]);
    expect(selectedDocumentCount(excluded, 386)).toBe(385);
    expect(reduceBulkSelection(excluded, { type: "clear" })).toEqual(initialBulkSelection);
  });
});
