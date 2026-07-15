import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checksum: vi.fn(async () => "b".repeat(64)),
  store: vi.fn(async () => ({ checksum: "b".repeat(64), size: 22n, storagePath: "/data/blobs/b.blob" })),
  version: vi.fn(async () => ({ id: "version-2" })),
  updateEntry: vi.fn(async () => undefined),
  createJobs: vi.fn(async () => ({ count: 2 }))
}));
vi.mock("@/server/documents/blobs", () => ({ checksumFile: mocks.checksum, storeImmutableFile: mocks.store, storageLayout: () => ({ library: "/data/library" }) }));
vi.mock("@/server/documents/versions", () => ({ createDocumentVersion: mocks.version }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    smbSyncEntry: { update: mocks.updateEntry },
    processingJob: { createMany: mocks.createJobs }
  }
}));

describe("writable SMB synchronization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("turns an external file modification into an attributed immutable version", async () => {
    const { applySmbModification } = await import("@/server/smb/sync");
    const entry = { id: "entry-1", documentId: "doc-1", lastChecksum: "a".repeat(64) };

    await expect(applySmbModification(entry, "/data/library/Familie/Anna/plan.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
      .resolves.toBe(true);

    expect(mocks.version).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "doc-1", source: "smb", actorLabel: "SMB-Administrator",
      expectedCurrentChecksum: "a".repeat(64), preserveCurrentOnConflict: true
    }));
    expect(mocks.updateEntry).toHaveBeenCalledWith({
      where: { id: "entry-1" },
      data: expect.objectContaining({ lastChecksum: "b".repeat(64), syncState: "synced" })
    });
  });
});
