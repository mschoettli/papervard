import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("document export lifecycle", () => {
  it("provides protected status, retry, dismiss and download routes", async () => {
    const [detail, retry, download] = await Promise.all([
      readFile("src/app/api/document-exports/[id]/route.ts", "utf8"),
      readFile("src/app/api/document-exports/[id]/retry/route.ts", "utf8"),
      readFile("src/app/api/document-exports/[id]/download/route.ts", "utf8")
    ]);
    expect(detail).toContain("deleteDocumentExport");
    expect(retry).toContain("retryDocumentExport");
    expect(download).toContain("documentExportForUser");
    expect(download).toContain('"Cache-Control": "private, no-store"');
  });

  it("purges expired archives from the worker loop", async () => {
    const [exports, worker] = await Promise.all([
      readFile("src/server/documents/exports.ts", "utf8"),
      readFile("src/server/jobs/worker.ts", "utf8")
    ]);
    expect(exports).toContain("purgeExpiredDocumentExports");
    expect(exports).toContain("24 * 60 * 60 * 1000");
    expect(worker).toContain("purgeExpiredDocumentExports");
  });
});
