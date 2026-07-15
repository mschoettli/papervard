import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { document: { findFirst: mocks.findFirst } } }));
vi.mock("@/server/documents/access", () => ({
  householdIdsForUser: vi.fn(async () => ["family-1"]),
  documentAccessWhere: vi.fn(() => ({ householdId: { in: ["family-1"] } }))
}));

let directory = "";
afterEach(async () => {
  vi.clearAllMocks();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("streamable document files", () => {
  it("returns an authorized file descriptor without loading the whole file", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "papervard-stream-"));
    const storagePath = path.join(directory, "large.blob");
    await writeFile(storagePath, Buffer.alloc(1024, 7));
    mocks.findFirst.mockResolvedValue({
      id: "doc-1",
      originalName: "aufnahme.dcm",
      mimeType: "application/dicom",
      storagePath
    });
    const { findAccessibleDocumentFile } = await import("@/server/documents/file");

    const file = await findAccessibleDocumentFile("doc-1", "user-1", false);

    expect(file).toEqual(expect.objectContaining({ size: 1024, mimeType: "application/dicom", storagePath }));
    expect(file).not.toHaveProperty("buffer");
  });
});
