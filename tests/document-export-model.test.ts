import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("document export persistence", () => {
  it("models export snapshots and queues them in the existing worker", async () => {
    const [schema, processor] = await Promise.all([
      readFile("prisma/schema.prisma", "utf8"),
      readFile("src/server/jobs/processor.ts", "utf8")
    ]);

    expect(schema).toContain("model DocumentExport {");
    expect(schema).toContain("model DocumentExportItem {");
    expect(schema).toContain("document_export");
    expect(schema).toContain("exportId");
    expect(processor).toContain('case "document_export"');
  });
});
