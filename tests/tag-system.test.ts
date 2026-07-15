import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("manual tag system", () => {
  it("moves every supported assignment type when tags are merged", () => {
    const source = readFileSync(path.join(process.cwd(), "src/server/actions/library.ts"), "utf8");
    const mergeStart = source.indexOf("export async function mergeTagAction");
    const mergeEnd = source.indexOf("export async function deleteTagAction");
    const mergeAction = source.slice(mergeStart, mergeEnd);

    expect(mergeAction).toContain("prisma.documentTag.createMany");
    expect(mergeAction).toContain("prisma.folderTag.createMany");
    expect(mergeAction).toContain("prisma.collectionTag.createMany");
    expect(mergeAction).toContain("prisma.dicomSeriesTag.createMany");
    expect(mergeAction).toContain("skipDuplicates: true");
  });
});
