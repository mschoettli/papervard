import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDocument: vi.fn(),
  createVersion: vi.fn(async () => ({ id: "version-2" })),
  createJobs: vi.fn(async () => ({ count: 2 })),
  storeBlob: vi.fn(async () => ({ checksum: "b".repeat(64), size: 8n, storagePath: "/data/blobs/new.blob" }))
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { findUnique: mocks.findDocument },
    processingJob: { createMany: mocks.createJobs }
  }
}));
vi.mock("@/server/documents/blobs", async (original) => {
  const actual = await original<typeof import("@/server/documents/blobs")>();
  return { ...actual, storeImmutableFile: mocks.storeBlob };
});
vi.mock("@/server/documents/versions", () => ({ createDocumentVersion: mocks.createVersion }));

let dataPath = "";
beforeEach(async () => {
  vi.clearAllMocks();
  dataPath = await mkdtemp(path.join(tmpdir(), "papervard-office-"));
  process.env.PAPERVARD_DATA_PATH = dataPath;
  process.env.ONLYOFFICE_INTERNAL_URL = "http://onlyoffice";
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dataPath, { recursive: true, force: true });
});

describe("ONLYOFFICE save callback", () => {
  it("streams the saved file into a new immutable version", async () => {
    mocks.findDocument.mockResolvedValue({ id: "doc-1", originalName: "plan.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(Buffer.from("PK\u0003\u0004data"), { status: 200 }));
    const { saveOnlyOfficeVersion } = await import("@/server/office/callback");

    await saveOnlyOfficeVersion({ documentId: "doc-1", userId: "user-1", downloadUrl: "http://onlyoffice/cache/plan.docx" });

    expect(mocks.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "doc-1", source: "web_editor", authorUserId: "user-1"
    }));
    expect(mocks.createJobs).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ type: "extract", versionId: "version-2" })
    ]) });
  });

  it("refuses callback downloads from another host", async () => {
    const { saveOnlyOfficeVersion } = await import("@/server/office/callback");
    await expect(saveOnlyOfficeVersion({ documentId: "doc-1", userId: "user-1", downloadUrl: "http://attacker.invalid/file" }))
      .rejects.toThrow("ONLYOFFICE");
  });
});
