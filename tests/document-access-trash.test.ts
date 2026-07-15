import { describe, expect, it } from "vitest";
import { documentAccessWhere } from "@/server/documents/access";

describe("active document access", () => {
  it("always excludes documents that are in the trash", () => {
    expect(documentAccessWhere("user-1", ["family-1"])).toEqual({
      AND: [
        { deletedAt: null },
        {
          OR: [
            { ownerUserId: "user-1" },
            { visibility: "family", householdId: { in: ["family-1"] } }
          ]
        }
      ]
    });
  });
});
