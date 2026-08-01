import { describe, expect, it } from "vitest";
import { compatibleDocumentIdsForMove, normalizeBulkDocumentRequest } from "@/server/documents/bulk-actions";

describe("bulk document move", () => {
  it("rejects a mixed private and family selection", () => {
    expect(() => compatibleDocumentIdsForMove([
      { id: "private", visibility: "private", householdId: "house", ownerUserId: "user" },
      { id: "family", visibility: "family", householdId: "house", ownerUserId: "user" }
    ], {
      id: "folder",
      visibility: "private",
      householdId: "house",
      createdByUserId: "user"
    })).toThrow("privaten und gemeinsamen");
  });

  it("returns only documents compatible with the target folder", () => {
    expect(compatibleDocumentIdsForMove([
      { id: "first", visibility: "private", householdId: "house", ownerUserId: "user" },
      { id: "other-owner", visibility: "private", householdId: "house", ownerUserId: "other" }
    ], {
      id: "folder",
      visibility: "private",
      householdId: "house",
      createdByUserId: "user"
    })).toEqual(["first"]);
  });

  it("normalizes tag operations without duplicate tag ids", () => {
    expect(normalizeBulkDocumentRequest({
      action: "add-tags",
      selection: { mode: "explicit", ids: ["doc-1"] },
      tagIds: ["paid", "paid", "insurance"]
    })).toMatchObject({
      action: "add-tags",
      tagIds: ["paid", "insurance"]
    });
  });
});
