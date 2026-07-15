import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((_command: string, args: string[], _options: unknown, callback: (error: Error | null) => void) => {
    const outputPrefix = args.at(-1);
    if (!outputPrefix) {
      callback(new Error("missing output prefix"));
      return;
    }
    writeFile(`${outputPrefix}.png`, Buffer.from("fake-png")).then(() => callback(null), callback);
  })
}));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("PDF thumbnails", () => {
  it("uses a deterministic thumbnail path below the shared data root", async () => {
    vi.stubEnv("PAPERVARD_DATA_PATH", "/tmp/papervard-data");
    const { thumbnailPath } = await import("@/server/pdf/thumbnail");

    expect(thumbnailPath("doc-123")).toBe("/tmp/papervard-data/thumbnails/doc-123.png");
  });

  it("creates and reuses a stored first-page thumbnail", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "papervard-thumbnail-test-"));
    vi.stubEnv("PAPERVARD_DATA_PATH", workDir);

    try {
      const pdfPath = path.join(workDir, "source.pdf");
      await writeFile(pdfPath, "%PDF-1.4");

      const { readOrCreateDocumentThumbnail, thumbnailPath } = await import("@/server/pdf/thumbnail");
      const firstRead = await readOrCreateDocumentThumbnail("doc-456", pdfPath);
      const secondRead = await readOrCreateDocumentThumbnail("doc-456", pdfPath);

      expect(firstRead.toString()).toBe("fake-png");
      expect(secondRead.toString()).toBe("fake-png");
      await expect(readFile(thumbnailPath("doc-456"))).resolves.toEqual(Buffer.from("fake-png"));
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});
