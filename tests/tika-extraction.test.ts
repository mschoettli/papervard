import { beforeEach, describe, expect, it, vi } from "vitest";

describe("local Tika extraction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.TIKA_URL;
    delete process.env.OCR_LANGUAGES;
  });

  it("streams a file to the local service and returns text metadata", async () => {
    const response = new Response("Rechnung 2026\nGesamtbetrag 42 CHF", {
      status: 200,
      headers: {
        "x-tika-parsed-by": "Apache Tika",
        "x-tika-content": "text/plain"
      }
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const { extractWithTika } = await import("@/server/extract/tika");

    const extracted = await extractWithTika("/data/blobs/source.blob", "rechnung.docx");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://tika:9998/tika",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Accept: "text/plain",
          "X-Tika-OCRLanguage": "deu+eng+fra+ita+spa"
        })
      })
    );
    expect(extracted.text).toContain("Gesamtbetrag");
    expect(extracted.metadata.parser).toBe("Apache Tika");
  });

  it("forwards the configured local OCR languages", async () => {
    process.env.OCR_LANGUAGES = "deu+eng";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Text", { status: 200 }));
    const { extractWithTika } = await import("@/server/extract/tika");

    await extractWithTika("/data/blobs/scan.blob", "scan.tiff");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://tika:9998/tika",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Tika-OCRLanguage": "deu+eng" })
      })
    );
  });

  it("signals protected documents without discarding the queued job", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Encrypted document; password required", { status: 422 }));
    const { extractWithTika, ProtectedDocumentError } = await import("@/server/extract/tika");

    await expect(extractWithTika("/data/blobs/protected.blob", "schutz.pdf"))
      .rejects.toBeInstanceOf(ProtectedDocumentError);
  });
});
