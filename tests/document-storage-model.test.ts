import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatBytes } from "@/lib/utils";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../prisma/migrations/000005_multiformat_versions_jobs/migration.sql", import.meta.url),
  "utf8"
);

describe("versioned multi-format storage model", () => {
  it("stores large sizes as bigint and formats values beyond gigabytes", () => {
    expect(schema).toMatch(/model FileBlob[\s\S]*size\s+BigInt/);
    expect(schema).toMatch(/model UploadSession[\s\S]*receivedSize\s+BigInt/);
    expect(formatBytes(5_497_558_138_880n)).toBe("5.0 TB");
  });

  it("models immutable blobs, versions, jobs, collections and content changes", () => {
    expect(schema).toContain("model FileBlob {");
    expect(schema).toContain("model DocumentVersion {");
    expect(schema).toContain("model ProcessingJob {");
    expect(schema).toContain("model Collection {");
    expect(schema).toContain("model ContentChange {");
    expect(schema).toContain("dicom_instance_added");
    expect(schema).toMatch(/currentVersionId\s+String\?\s+@unique/);
    expect(schema).toMatch(/@@unique\(\[documentId, versionNumber\]\)/);
  });

  it("models DICOM studies, series and instances without replacing original blobs", () => {
    expect(schema).toContain("model DicomStudy {");
    expect(schema).toContain("model DicomSeries {");
    expect(schema).toContain("model DicomInstance {");
    expect(schema).toMatch(/patientNameCiphertext\s+String\?/);
    expect(schema).toMatch(/model DicomInstance[\s\S]*blobId\s+String/);
  });

  it("supports tags on folders, collections and DICOM series", () => {
    expect(schema).toContain("model FolderTag {");
    expect(schema).toContain("model CollectionTag {");
    expect(schema).toContain("model DicomSeriesTag {");
  });

  it("migrates every existing PDF into an initial immutable version", () => {
    expect(migration).toMatch(/INSERT INTO "FileBlob"/);
    expect(migration).toMatch(/INSERT INTO "DocumentVersion"/);
    expect(migration).toMatch(/UPDATE "Document"[\s\S]*"currentVersionId"/);
  });
});
