import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("document bulk routes", () => {
  it("protects bulk mutations with authentication and same-origin checks", async () => {
    const source = await readFile("src/app/api/documents/bulk/route.ts", "utf8");
    expect(source).toContain("isSameOriginMutation");
    expect(source).toContain("requireUser");
    expect(source).toContain("applyDocumentBulkOperation");
  });

  it("creates persistent export jobs instead of synchronous archives", async () => {
    const [route, implementation] = await Promise.all([
      readFile("src/app/api/document-exports/route.ts", "utf8"),
      readFile("src/server/documents/exports.ts", "utf8")
    ]);
    expect(route).toContain("createDocumentExport");
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(implementation).toContain("processingJob.create");
    expect(implementation).toContain("snapshotBatches");
    expect(implementation).toContain("completedItemBatches");
    expect(route).not.toContain("readFile(");
  });
});
