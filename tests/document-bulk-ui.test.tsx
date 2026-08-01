import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DocumentBulkWorkspace } from "@/components/document-bulk-workspace";
import { readFile } from "node:fs/promises";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("document bulk workspace", () => {
  it("offers page selection and the agreed bulk actions", () => {
    const html = renderToStaticMarkup(
      <DocumentBulkWorkspace
        visibleDocuments={[{ id: "doc-1", visibility: "private" }]}
        total={12}
        querySelection={{ mode: "query", scope: "all", tagIds: [], excludeIds: [] }}
        folders={[{ id: "private", name: "Privat", visibility: "private" }]}
        tags={[{ id: "insurance", name: "Versicherung", color: "#a8472a" }]}
      >
        <div>Dokumentkarten</div>
      </DocumentBulkWorkspace>
    );

    expect(html).toContain("Sichtbare auswählen");
    expect(html).toContain("Verschieben");
    expect(html).toContain("Tags");
    expect(html).toContain("ZIP");
    expect(html).toContain("Papierkorb");
  });

  it("integrates selection controls into cards, search results and the app activity dock", async () => {
    const [page, layout] = await Promise.all([
      readFile("src/app/(app)/documents/page.tsx", "utf8"),
      readFile("src/app/(app)/layout.tsx", "utf8")
    ]);
    expect(page).toContain("DocumentBulkWorkspace");
    expect(page).toContain("DocumentSelectionCheckbox");
    expect(page).toContain("selectionContextKey");
    expect(layout).toContain("ExportStatusDock");
  });

  it("resets stale selections when page or filter context changes and explains mixed visibility", async () => {
    const source = await readFile("src/components/document-bulk-workspace.tsx", "utf8");
    expect(source).toContain("previousSelectionContext");
    expect(source).toContain("Private und gemeinsame Dokumente bitte getrennt verschieben");
  });
});
