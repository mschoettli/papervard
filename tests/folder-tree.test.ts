import { describe, expect, it } from "vitest";
import {
  collectDescendantFolderIds,
  moveWouldCreateCycle,
  trashExpiresAt
} from "@/server/documents/folders";

const folders = [
  { id: "root", parentId: null },
  { id: "insurance", parentId: "root" },
  { id: "health", parentId: "insurance" },
  { id: "bills", parentId: "root" }
];

describe("folder hierarchy", () => {
  it("collects the selected folder and every nested descendant", () => {
    expect(collectDescendantFolderIds(folders, "insurance")).toEqual([
      "insurance",
      "health"
    ]);
  });

  it("prevents moving a folder into itself or one of its descendants", () => {
    expect(moveWouldCreateCycle(folders, "insurance", "insurance")).toBe(true);
    expect(moveWouldCreateCycle(folders, "insurance", "health")).toBe(true);
    expect(moveWouldCreateCycle(folders, "insurance", "bills")).toBe(false);
  });

  it("keeps trash items for exactly 30 days", () => {
    const deletedAt = new Date("2026-07-14T10:00:00.000Z");
    expect(trashExpiresAt(deletedAt).toISOString()).toBe("2026-08-13T10:00:00.000Z");
  });
});
