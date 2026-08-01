import { describe, expect, it } from "vitest";
import { buildDocumentExportPaths } from "@/server/documents/export-paths";

describe("document export paths", () => {
  it("keeps the Papervard folder hierarchy and original extension", () => {
    const [item] = buildDocumentExportPaths(
      [
        { id: "health", name: "Gesundheit", parentId: null },
        { id: "okk", name: "ÖKK", parentId: "health" }
      ],
      [{ id: "doc-1", folderId: "okk", year: 2026, title: "Leistung Januar", originalName: "scan.pdf" }]
    );

    expect(item.relativePath).toBe("Papervard-Export/Gesundheit/OEKK/2026-Leistung-Januar.pdf");
  });

  it("creates stable suffixes for duplicate archive names", () => {
    const items = buildDocumentExportPaths(
      [{ id: "okk", name: "ÖKK", parentId: null }],
      [
        { id: "doc-1", folderId: "okk", year: 2026, title: "Leistung", originalName: "one.pdf" },
        { id: "doc-2", folderId: "okk", year: 2026, title: "Leistung", originalName: "two.pdf" }
      ]
    );

    expect(items.map((item) => item.relativePath)).toEqual([
      "Papervard-Export/OEKK/2026-Leistung.pdf",
      "Papervard-Export/OEKK/2026-Leistung-2.pdf"
    ]);
  });
});
