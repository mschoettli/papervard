import { describe, expect, it } from "vitest";
import {
  resolveDocumentFormat,
  supportedUploadExtensions,
  validateFormatSignature
} from "@/server/documents/formats";

describe("multi-format registry", () => {
  it.each([
    ["vertrag.docx", "document", "office"],
    ["budget.xlsx", "spreadsheet", "office"],
    ["vortrag.key", "presentation", "converted-office"],
    ["scan.heic", "image", "image"],
    ["nachricht.msg", "email", "email"],
    ["buch.azw3", "ebook", "ebook"],
    ["roentgen.dcm", "dicom", "dicom"],
    ["sammlung.7z", "archive", "collection"]
  ])("classifies %s as %s with %s preview", (name, family, preview) => {
    expect(resolveDocumentFormat(name)?.family).toBe(family);
    expect(resolveDocumentFormat(name)?.preview).toBe(preview);
  });

  it("rejects executable files and exposes the complete upload accept list", () => {
    expect(resolveDocumentFormat("malware.exe")).toBeNull();
    expect(supportedUploadExtensions()).toEqual(
      expect.arrayContaining([".pdf", ".doc", ".docx", ".xlsx", ".pptx", ".heic", ".eml", ".epub", ".dcm"])
    );
  });

  it("requires trustworthy signatures for PDF, ZIP-based office and DICOM files", () => {
    const pdf = resolveDocumentFormat("rechnung.pdf");
    const docx = resolveDocumentFormat("vertrag.docx");
    const dicom = resolveDocumentFormat("aufnahme.dcm");

    expect(pdf && validateFormatSignature(pdf, Buffer.from("%PDF-1.7\n"))).toBe(true);
    expect(pdf && validateFormatSignature(pdf, Buffer.from("not a pdf"))).toBe(false);
    expect(docx && validateFormatSignature(docx, Buffer.from("PK\u0003\u0004content"))).toBe(true);
    expect(docx && validateFormatSignature(docx, Buffer.from("plain text"))).toBe(false);

    const dicomHeader = Buffer.alloc(132);
    dicomHeader.write("DICM", 128, "ascii");
    expect(dicom && validateFormatSignature(dicom, dicomHeader)).toBe(true);
    expect(dicom && validateFormatSignature(dicom, Buffer.from("renamed image"))).toBe(false);
  });
});
