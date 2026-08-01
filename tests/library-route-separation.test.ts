import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("separate folder and document routes", () => {
  it("provides a first-class folder route in the main navigation", () => {
    expect(existsSync(path.join(process.cwd(), "src/app/(app)/folders/page.tsx"))).toBe(true);
    expect(source("src/components/app-nav.tsx")).toContain('href="/folders"');
    expect(source("src/components/app-nav.tsx")).toContain('label="Ordner"');
  });

  it("keeps the folder page focused on folders and sends searches to documents", () => {
    const foldersPage = source("src/app/(app)/folders/page.tsx");

    expect(foldersPage).toContain('action="/documents"');
    expect(foldersPage).toContain("FolderBrowser");
    expect(foldersPage).not.toContain("DocumentThumbnail");
    expect(foldersPage).not.toContain("DocumentResults");
    expect(foldersPage).toContain('redirect("/folders")');
  });

  it("includes descendant documents and identifies their folder path", () => {
    const documentsPage = source("src/app/(app)/documents/page.tsx");

    expect(documentsPage).toContain("folderId: { in: recursiveFolderIds }");
    expect(documentsPage).toContain("inklusive Unterordner");
    expect(documentsPage).toContain("relativeFolderPath");
    expect(documentsPage).not.toContain("<aside");
    expect(documentsPage).not.toContain("DraggableLibraryItem");
    expect(documentsPage).toContain('redirect("/folders")');
  });

  it("distinguishes sibling insertion from dropping into a folder", () => {
    const browser = source("src/components/folder-browser.tsx");

    expect(browser).toContain("beforeFolderId");
    expect(browser).toContain("targetParentId");
    expect(browser).toContain("event.stopPropagation()");
    expect(browser).toContain("append-after-last");
    expect(browser).toContain("movableFolders");
    expect(browser).toContain("mit Drag-and-drop verschieben");
  });
});
