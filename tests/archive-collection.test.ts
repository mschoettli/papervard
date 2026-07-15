import { describe, expect, it } from "vitest";

describe("safe archive collections", () => {
  it("accepts nested source names as collection metadata but rejects traversal", async () => {
    const { validateArchiveEntries } = await import("@/server/collections/archive");

    expect(validateArchiveEntries(["Fotos/2026/bild.jpg", "Dokumente/rechnung.pdf"]))
      .toEqual(["Fotos/2026/bild.jpg", "Dokumente/rechnung.pdf"]);
    expect(() => validateArchiveEntries(["../../etc/passwd"])).toThrow("unsicher");
    expect(() => validateArchiveEntries(["/root/secret"])).toThrow("unsicher");
  });
});
