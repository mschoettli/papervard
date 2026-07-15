import { describe, expect, it } from "vitest";

describe("SMB library paths", () => {
  it("maps family/private member trees without allowing path traversal", async () => {
    const { memberDirectoryName, parseSmbPath, safePathSegment } = await import("@/server/smb/paths");

    expect(memberDirectoryName({ id: "user-123456", name: "Anna Müller" })).toBe("Anna Müller");
    expect(parseSmbPath("Familie/Anna Müller/Dokumente/Rechnung.pdf")).toEqual({
      visibility: "family",
      memberDirectory: "Anna Müller",
      folderSegments: ["Dokumente"],
      fileName: "Rechnung.pdf"
    });
    expect(parseSmbPath("Privat/Max/Versicherungen/Hausrat.pdf")?.visibility).toBe("private");
    expect(safePathSegment("../Geheim/../x")).toBe("Geheim x");
    expect(parseSmbPath("Andere/Max/a.pdf")).toBeNull();
  });
});
