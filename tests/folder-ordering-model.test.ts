import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const folderModel = schema.match(/model Folder \{([\s\S]*?)\n\}/)?.[1] ?? "";
const actions = readFileSync(new URL("../src/server/actions/library.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../prisma/migrations/000007_folder_position/migration.sql", import.meta.url), "utf8");

describe("persistent folder ordering", () => {
  it("stores a sibling position and indexes it with the parent", () => {
    expect(folderModel).toMatch(/position\s+Int\s+@default\(0\)/);
    expect(folderModel).toContain("@@index([parentId, position, deletedAt])");
  });

  it("reorders folders through an authorized atomic server action", () => {
    expect(actions).toContain("export async function reorderFolderAction");
    expect(actions).toContain("reorderSiblingFolderIds");
    expect(actions).toContain("prisma.$transaction");
    expect(actions).toContain("position:");
  });

  it("initializes one shared family order while keeping private owners separate", () => {
    expect(migration).toContain('CASE WHEN "visibility" = \'private\'');
    expect(migration).toContain('THEN "createdByUserId" ELSE "householdId" END');
  });
});
