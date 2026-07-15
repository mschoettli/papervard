import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUpload: vi.fn(),
  findDocument: vi.fn(async () => null),
  createDocument: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: "doc-1", ...args.data })),
  updateUpload: vi.fn(async () => ({ id: "upload-1" })),
  createJobs: vi.fn(async () => ({ count: 2 })),
  createVersion: vi.fn(async () => ({ id: "version-1" })),
  storeBlob: vi.fn(async () => ({ checksum: "a".repeat(64), size: 132n, storagePath: "/data/blobs/aa/blob" })),
  findStudy: vi.fn(async (): Promise<{ document: { id: string; title?: string } } | null> => null),
  readDicom: vi.fn(async () => ({
    studyInstanceUid: "1.2.3", seriesInstanceUid: "1.2.3.4", sopInstanceUid: "1.2.3.4.5"
  })),
  attachDicom: vi.fn(async () => ({ studyId: "study-1", seriesId: "series-1" }))
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    uploadSession: { findUnique: mocks.findUpload, update: mocks.updateUpload },
    document: { findFirst: mocks.findDocument, create: mocks.createDocument },
    dicomStudy: { findFirst: mocks.findStudy },
    processingJob: { createMany: mocks.createJobs }
  }
}));
vi.mock("@/server/documents/blobs", async (original) => {
  const actual = await original<typeof import("@/server/documents/blobs")>();
  return { ...actual, storeImmutableFile: mocks.storeBlob };
});
vi.mock("@/server/documents/versions", () => ({ createDocumentVersion: mocks.createVersion }));
vi.mock("@/server/dicom/metadata", () => ({ readDicomMetadata: mocks.readDicom }));
vi.mock("@/server/dicom/index", () => ({ attachDicomInstance: mocks.attachDicom }));

let stagingDirectory: string;

beforeEach(async () => {
  vi.clearAllMocks();
  stagingDirectory = await mkdtemp(path.join(tmpdir(), "papervard-ingest-"));
});

afterEach(async () => rm(stagingDirectory, { recursive: true, force: true }));

describe("uploaded file ingestion", () => {
  it("validates DICOM, creates one library document and queues derived processing", async () => {
    const stagingPath = path.join(stagingDirectory, "study.dcm.part");
    const bytes = Buffer.alloc(132);
    bytes.write("DICM", 128, "ascii");
    await writeFile(stagingPath, bytes);
    mocks.findUpload.mockResolvedValue({
      id: "upload-1",
      ownerUserId: "user-1",
      householdId: "family-1",
      folderId: "folder-1",
      visibility: "private",
      originalName: "knie-2026.dcm",
      mimeType: "application/dicom",
      format: "dicom",
      family: "dicom",
      receivedSize: 132n,
      stagingPath,
      status: "uploaded"
    });

    const { ingestUploadSession } = await import("@/server/jobs/ingest");
    const document = await ingestUploadSession("upload-1");

    expect(mocks.createDocument).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "knie 2026",
        family: "dicom",
        format: "dicom",
        size: 132n,
        ownerUserId: "user-1",
        folderId: "folder-1"
      })
    });
    expect(mocks.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "doc-1",
      source: "upload",
      authorUserId: "user-1"
    }));
    expect(mocks.createJobs).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ type: "extract", documentId: "doc-1" }),
        expect.objectContaining({ type: "preview", documentId: "doc-1" })
      ])
    });
    expect(document.id).toBe("doc-1");
  });

  it("rejects a renamed PDF before creating a document", async () => {
    const stagingPath = path.join(stagingDirectory, "fake.pdf.part");
    await writeFile(stagingPath, "not a PDF");
    mocks.findUpload.mockResolvedValue({
      id: "upload-1",
      ownerUserId: "user-1",
      householdId: "family-1",
      folderId: "folder-1",
      visibility: "private",
      originalName: "fake.pdf",
      mimeType: "application/pdf",
      format: "pdf",
      family: "document",
      receivedSize: 9n,
      stagingPath,
      status: "uploaded"
    });

    const { ingestUploadSession } = await import("@/server/jobs/ingest");
    await expect(ingestUploadSession("upload-1")).rejects.toThrow("Dateisignatur");
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it("adds another DICOM instance to an existing study instead of creating another document", async () => {
    const stagingPath = path.join(stagingDirectory, "study-2.dcm.part");
    const bytes = Buffer.alloc(132);
    bytes.write("DICM", 128, "ascii");
    await writeFile(stagingPath, bytes);
    mocks.findUpload.mockResolvedValue({
      id: "upload-1",
      ownerUserId: "user-1",
      householdId: "family-1",
      folderId: "folder-1",
      visibility: "private",
      originalName: "knie-2.dcm",
      mimeType: "application/dicom",
      format: "dicom",
      family: "dicom",
      receivedSize: 132n,
      stagingPath,
      status: "uploaded"
    });
    mocks.findStudy.mockResolvedValue({ document: { id: "study-document", title: "Knie" } });

    const { ingestUploadSession } = await import("@/server/jobs/ingest");
    const document = await ingestUploadSession("upload-1");

    expect(mocks.findStudy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        studyInstanceUid: "1.2.3",
        document: expect.objectContaining({ ownerUserId: "user-1", visibility: "private" })
      })
    }));
    expect(mocks.attachDicom).toHaveBeenCalledWith("study-document", expect.objectContaining({
      logContentChange: true,
      actorUserId: "user-1"
    }), expect.objectContaining({ studyInstanceUid: "1.2.3" }));
    expect(mocks.createDocument).not.toHaveBeenCalled();
    expect(mocks.createVersion).not.toHaveBeenCalled();
    expect(document.id).toBe("study-document");
  });
});
