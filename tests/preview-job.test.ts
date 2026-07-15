import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDocument: vi.fn(),
  pdfThumbnail: vi.fn(async () => "/data/thumbnails/doc-1.png"),
  imageThumbnail: vi.fn(async () => "/data/thumbnails/doc-1.png")
}));
vi.mock("@/lib/prisma", () => ({ prisma: { document: { findUnique: mocks.findDocument } } }));
vi.mock("@/server/pdf/thumbnail", () => ({ createDocumentThumbnail: mocks.pdfThumbnail }));
vi.mock("@/server/previews/image", () => ({ createImageThumbnail: mocks.imageThumbnail }));

describe("preview preparation jobs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders PDF and image thumbnails and leaves native viewers untouched", async () => {
    const { prepareDocumentPreview } = await import("@/server/jobs/preview-document");
    mocks.findDocument.mockResolvedValueOnce({ id: "doc-1", format: "pdf", family: "document", storagePath: "/data/a.blob" });
    await expect(prepareDocumentPreview("doc-1")).resolves.toEqual({ kind: "pdf", path: "/data/thumbnails/doc-1.png" });
    expect(mocks.pdfThumbnail).toHaveBeenCalledWith("doc-1", "/data/a.blob");

    mocks.findDocument.mockResolvedValueOnce({ id: "doc-2", format: "image", family: "image", storagePath: "/data/b.blob" });
    await prepareDocumentPreview("doc-2");
    expect(mocks.imageThumbnail).toHaveBeenCalledWith("doc-2", "/data/b.blob");

    mocks.findDocument.mockResolvedValueOnce({ id: "doc-3", format: "dicom", family: "dicom", storagePath: "/data/c.blob" });
    await expect(prepareDocumentPreview("doc-3")).resolves.toEqual({ kind: "native", path: null });
  });
});
