import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDocument: vi.fn(),
  updateDocument: vi.fn(async (args: unknown) => args),
  deleteChunks: vi.fn(async () => ({ count: 0 })),
  createChunk: vi.fn(async (args: { data: { documentId: string; page: number; content: string } }) => ({
    id: `chunk-${args.data.page}`,
    ...args.data
  })),
  raw: vi.fn(async () => 1),
  extract: vi.fn(async () => ({ text: "Police 2024 Versicherung Hausrat", metadata: {} })),
  indexDicom: vi.fn(async () => ({ studyId: "study-1", seriesId: "series-1" }))
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { findUnique: mocks.findDocument, update: mocks.updateDocument },
    textChunk: { deleteMany: mocks.deleteChunks, create: mocks.createChunk },
    $executeRawUnsafe: mocks.raw
  }
}));
vi.mock("@/server/extract/tika", () => ({
  extractWithTika: mocks.extract,
  ProtectedDocumentError: class ProtectedDocumentError extends Error {}
}));
vi.mock("@/server/dicom/index", () => ({ indexDicomDocument: mocks.indexDicom }));

describe("broad document extraction job", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extracts non-PDF formats locally and indexes searchable chunks", async () => {
    mocks.findDocument.mockResolvedValue({
      id: "doc-1",
      originalName: "hausrat.docx",
      storagePath: "/data/blobs/hausrat.blob",
      family: "document",
      year: 2026,
      yearLocked: false
    });
    const { extractDocumentContent } = await import("@/server/jobs/extract-document");

    const result = await extractDocumentContent("doc-1");

    expect(mocks.extract).toHaveBeenCalledWith("/data/blobs/hausrat.blob", "hausrat.docx");
    expect(mocks.createChunk).toHaveBeenCalledWith({
      data: expect.objectContaining({ documentId: "doc-1", page: 1, content: expect.stringContaining("Versicherung") })
    });
    expect(mocks.raw).toHaveBeenCalled();
    expect(mocks.updateDocument).toHaveBeenLastCalledWith({
      where: { id: "doc-1" },
      data: expect.objectContaining({ indexStatus: "indexed", year: 2024 })
    });
    expect(result.chunkCount).toBe(1);
  });

  it("routes DICOM to its protected metadata pipeline", async () => {
    mocks.findDocument.mockResolvedValue({
      id: "dicom-1",
      originalName: "study.dcm",
      storagePath: "/data/blobs/study.blob",
      family: "dicom",
      year: 2026,
      yearLocked: false
    });
    const { extractDocumentContent } = await import("@/server/jobs/extract-document");

    await expect(extractDocumentContent("dicom-1")).resolves.toEqual({
      chunkCount: 0,
      metadata: { studyId: "study-1", seriesId: "series-1" }
    });
    expect(mocks.indexDicom).toHaveBeenCalledWith("dicom-1");
    expect(mocks.extract).not.toHaveBeenCalled();
  });
});
