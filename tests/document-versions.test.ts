import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(async () => 1),
  findDocument: vi.fn(async () => ({
    id: "doc-1",
    currentVersion: { id: "version-1", versionNumber: 1 }
  })),
  upsertBlob: vi.fn(async () => ({ id: "blob-2" })),
  maxVersion: vi.fn(async () => ({ _max: { versionNumber: 1 } })),
  createVersion: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: "version-2", ...args.data })),
  updateDocument: vi.fn(async () => ({ id: "doc-1" })),
  createChange: vi.fn(async () => ({ id: "change-1" }))
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      $executeRawUnsafe: mocks.lock,
      document: { findUnique: mocks.findDocument, update: mocks.updateDocument },
      fileBlob: { upsert: mocks.upsertBlob },
      documentVersion: { aggregate: mocks.maxVersion, create: mocks.createVersion },
      contentChange: { create: mocks.createChange }
    }))
  }
}));

describe("document versions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("atomically appends a version, moves the current pointer and records the content change", async () => {
    const { createDocumentVersion } = await import("@/server/documents/versions");

    const version = await createDocumentVersion({
      documentId: "doc-1",
      checksum: "a".repeat(64),
      size: 4_294_967_296n,
      storagePath: "/data/blobs/aa/blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      source: "web_editor",
      authorUserId: "user-1"
    });

    expect(mocks.lock).toHaveBeenCalledWith(
      'SELECT 1 FROM "Document" WHERE "id" = $1 FOR UPDATE',
      "doc-1"
    );
    expect(mocks.createVersion).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentId: "doc-1",
        versionNumber: 2,
        blobId: "blob-2",
        baseVersionId: "version-1",
        source: "web_editor",
        authorUserId: "user-1"
      })
    });
    expect(mocks.maxVersion).toHaveBeenCalledWith({
      where: { documentId: "doc-1" },
      _max: { versionNumber: true }
    });
    expect(mocks.updateDocument).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: expect.objectContaining({
        currentVersionId: "version-2",
        size: 4_294_967_296n,
        checksum: "a".repeat(64)
      })
    });
    expect(mocks.createChange).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentId: "doc-1",
        versionId: "version-2",
        actorUserId: "user-1",
        kind: "version_created"
      })
    });
    expect(version.id).toBe("version-2");
  });

  it("attributes SMB changes without requiring a Papervard user", async () => {
    const { createDocumentVersion } = await import("@/server/documents/versions");

    await createDocumentVersion({
      documentId: "doc-1",
      checksum: "b".repeat(64),
      size: 12n,
      storagePath: "/data/blobs/bb/blob",
      mimeType: "application/pdf",
      source: "smb",
      actorLabel: "SMB-Administrator"
    });

    expect(mocks.createChange).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorUserId: null, actorLabel: "SMB-Administrator" })
    });
  });

  it("retains a stale save as a conflict version without moving the current pointer", async () => {
    const { createDocumentVersion } = await import("@/server/documents/versions");

    const version = await createDocumentVersion({
      documentId: "doc-1",
      checksum: "c".repeat(64),
      size: 8n,
      storagePath: "/data/blobs/cc/blob",
      mimeType: "text/markdown",
      source: "web_editor",
      authorUserId: "user-1",
      expectedCurrentVersionId: "older-version",
      preserveCurrentOnConflict: true
    });

    expect(mocks.createVersion).toHaveBeenCalledWith({
      data: expect.objectContaining({ baseVersionId: "older-version", isConflict: true })
    });
    expect(mocks.updateDocument).not.toHaveBeenCalled();
    expect(version.isConflict).toBe(true);
  });
});
