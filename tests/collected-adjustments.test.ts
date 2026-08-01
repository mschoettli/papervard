import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function source(relativePath: string) {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

describe("collected document-library adjustments", () => {
  it("keeps upload work outside the documents page and shows global progress", async () => {
    const layout = await source("src/app/(app)/layout.tsx");

    expect(layout).toContain("UploadManagerProvider");
    expect(layout).toContain("UploadStatusDock");
  });

  it("opens tag management and document tag selection in dialogs", async () => {
    const documentsPage = await source("src/app/(app)/documents/page.tsx");
    const foldersPage = await source("src/app/(app)/folders/page.tsx");
    const modals = await source("src/components/library-modals.tsx");

    expect(foldersPage).toContain("TagManagerModal");
    expect(documentsPage).toContain("TagSelectionModal");
    expect(modals).toContain("Tag-Sammlung");
    expect(modals).toContain("onSubmit={() => dialogRef.current?.close()}");
  });

  it("offers folder editing and deletion through a three-dot menu", async () => {
    const folderBrowser = await source("src/components/folder-browser.tsx");
    const modals = await source("src/components/library-modals.tsx");

    expect(folderBrowser).toContain("FolderActionsMenu");
    expect(modals).toContain("Ordner bearbeiten");
    expect(modals).toContain("icon");
  });

  it("stores a selectable icon on every folder", async () => {
    const schema = await source("prisma/schema.prisma");
    const actions = await source("src/server/actions/library.ts");

    expect(schema).toMatch(/model Folder \{[\s\S]*?\n  icon\s+String/);
    expect(actions).toContain("folderIconSchema");
    expect(actions).toContain("icon: parsed.icon");
  });

  it("provides a persisted light and dark theme from the system tab", async () => {
    const rootLayout = await source("src/app/layout.tsx");
    const systemPage = await source("src/app/(app)/admin/system/page.tsx");
    const styles = await source("src/app/globals.css");

    expect(rootLayout).toContain("papervard-theme");
    expect(systemPage).toContain("ThemeToggle");
    expect(styles).toContain(".dark");
    expect(styles).toContain("--surface:");
  });

  it("installs the server-only marker required by the standalone worker", async () => {
    const packageJson = JSON.parse(await source("package.json")) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.dependencies?.["server-only"]).toBeTruthy();
    expect(packageJson.scripts?.worker).toContain("--conditions=react-server");
  });
});
