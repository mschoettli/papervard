import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeZipArchive } from "@/server/documents/zip-export";

describe("streamed document zip export", () => {
  it("writes a ZIP file and reports entry progress", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "papervard-export-test-"));
    const source = path.join(directory, "source.txt");
    const output = path.join(directory, "export.zip.part");
    await writeFile(source, "Papervard export content");
    const progress: number[] = [];

    const result = await writeZipArchive(
      [{ id: "item-1", sourcePath: source, relativePath: "Papervard-Export/Ordner/Dokument.txt", size: 24n }],
      output,
      async (completed) => { progress.push(completed); }
    );

    const bytes = await readFile(output);
    expect(bytes.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(result).toEqual({ completedItemIds: ["item-1"], skipped: [] });
    expect(progress.at(-1)).toBe(1);
  });
});
