import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDocument: vi.fn(),
  upsertStudy: vi.fn(async () => ({ id: "study-db-1" })),
  upsertSeries: vi.fn(async () => ({ id: "series-db-1" })),
  upsertInstance: vi.fn(async () => ({ id: "instance-db-1" })),
  findInstance: vi.fn(async () => null),
  upsertBlob: vi.fn(async () => ({ id: "blob-1" })),
  aggregateInstances: vi.fn(async () => ({ _sum: { frames: 1 } })),
  updateDocument: vi.fn(async () => undefined),
  readMetadata: vi.fn(),
  encrypt: vi.fn((value: string | null | undefined, context: string) => value ? `encrypted:${context}:${value}` : null)
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { findUnique: mocks.findDocument, update: mocks.updateDocument },
    dicomStudy: { upsert: mocks.upsertStudy },
    dicomSeries: { upsert: mocks.upsertSeries },
    dicomInstance: { findUnique: mocks.findInstance, upsert: mocks.upsertInstance, aggregate: mocks.aggregateInstances },
    fileBlob: { upsert: mocks.upsertBlob }
  }
}));
vi.mock("@/server/dicom/metadata", () => ({ readDicomMetadata: mocks.readMetadata }));
vi.mock("@/server/security/field-encryption", () => ({ encryptSensitiveField: mocks.encrypt }));

describe("DICOM study indexing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("groups the instance and encrypts identifying patient fields", async () => {
    mocks.findDocument.mockResolvedValue({
      id: "doc-1", dicomStudy: null,
      currentVersion: { blob: { checksum: "abc", size: 42n, storagePath: "/data/blobs/study.blob", mimeType: "application/dicom" } }
    });
    mocks.readMetadata.mockResolvedValue({
      studyInstanceUid: "1.2.3", seriesInstanceUid: "1.2.3.4", sopInstanceUid: "1.2.3.4.5",
      patientName: "Muster^Anna", patientBirthDate: "19800102", patientId: "P-17",
      studyDate: "20260715", studyDescription: "Knie", seriesNumber: 2, instanceNumber: 7,
      modality: "MR", seriesDescription: "Sagittal", bodyPart: "KNEE", rows: 512, columns: 512,
      frames: 1, transferSyntaxUid: "1.2.840.10008.1.2.1"
    });
    const { indexDicomDocument } = await import("@/server/dicom/index");

    await indexDicomDocument("doc-1");

    expect(mocks.upsertStudy).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        patientNameCiphertext: expect.stringContaining("encrypted:1.2.3:patient-name"),
        patientBirthDateCiphertext: expect.stringContaining("encrypted:1.2.3:patient-birth-date"),
        patientIdCiphertext: expect.stringContaining("encrypted:1.2.3:patient-id")
      })
    }));
    expect(mocks.upsertSeries).toHaveBeenCalledWith(expect.objectContaining({
      where: { studyId_seriesInstanceUid: { studyId: "study-db-1", seriesInstanceUid: "1.2.3.4" } }
    }));
    expect(mocks.upsertInstance).toHaveBeenCalledWith(expect.objectContaining({
      where: { seriesId_sopInstanceUid: { seriesId: "series-db-1", sopInstanceUid: "1.2.3.4.5" } },
      create: expect.objectContaining({ blobId: "blob-1", sopInstanceUid: "1.2.3.4.5" })
    }));
    expect(mocks.updateDocument).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { indexStatus: "indexed", indexError: null, pageCount: 1 }
    });
  });
});
