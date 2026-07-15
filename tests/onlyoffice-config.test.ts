import { beforeEach, describe, expect, it } from "vitest";

describe("ONLYOFFICE editor configuration", () => {
  beforeEach(() => {
    process.env.ONLYOFFICE_JWT_SECRET = "onlyoffice-test-secret-123456789";
    process.env.PAPERVARD_SIGNING_SECRET = "papervard-test-secret-123456789";
    process.env.PAPERVARD_INTERNAL_URL = "http://web:3000";
  });

  it("creates an editable local configuration tied to the current version", async () => {
    const { createOnlyOfficeConfig, verifyOnlyOfficeJwt } = await import("@/server/office/config");
    const config = createOnlyOfficeConfig({
      id: "doc-1",
      originalName: "budget.xlsx",
      family: "spreadsheet",
      currentVersion: { id: "version-4", versionNumber: 4 }
    }, { id: "user-1", name: "Mira" });

    expect(config.documentType).toBe("cell");
    expect(config.document.key).toContain("version-4");
    expect(config.document.url).toContain("http://web:3000/api/office/files/");
    expect(config.editorConfig.callbackUrl).toContain("/api/office/callback/doc-1");
    expect(config.document.permissions.edit).toBe(true);
    expect(verifyOnlyOfficeJwt(config.token).document.key).toBe(config.document.key);
  });

  it("rejects unsupported formats", async () => {
    const { createOnlyOfficeConfig, isOnlyOfficeEditable } = await import("@/server/office/config");
    expect(isOnlyOfficeEditable({ originalName: "scan.jpg", family: "image" })).toBe(false);
    expect(() => createOnlyOfficeConfig({
      id: "doc-1",
      originalName: "scan.jpg",
      family: "image",
      currentVersion: { id: "version-1", versionNumber: 1 }
    }, { id: "user-1", name: "Mira" })).toThrow("bearbeitet");
  });

  it("advertises editing only for formats supported by the local editor", async () => {
    const { isOnlyOfficeEditable } = await import("@/server/office/config");

    expect(isOnlyOfficeEditable({ originalName: "contract.pdf", family: "document" })).toBe(true);
    expect(isOnlyOfficeEditable({ originalName: "notes.txt", family: "document" })).toBe(true);
    expect(isOnlyOfficeEditable({ originalName: "notes.md", family: "document" })).toBe(false);
    expect(isOnlyOfficeEditable({ originalName: "archive.pages", family: "document" })).toBe(false);
    expect(isOnlyOfficeEditable({ originalName: "sheet.xlsx", family: "spreadsheet" })).toBe(true);
  });
});
