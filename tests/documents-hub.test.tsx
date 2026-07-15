import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

vi.mock("@/server/auth", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1", name: "Mara", role: "user" }))
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      groupBy: vi.fn(async () => [])
    },
    folder: {
      findMany: vi.fn(async () => [])
    },
    tag: {
      findMany: vi.fn(async () => [])
    },
    householdMember: {
      findMany: vi.fn(async () => [{ householdId: "family-1" }]),
      findFirst: vi.fn(async () => ({ householdId: "family-1" }))
    },
    savedSearch: {
      findMany: vi.fn(async () => [])
    }
  }
}));

vi.mock("@/server/search/search", () => ({
  hybridSearch: vi.fn(async () => ({ results: [], total: 0 }))
}));

vi.mock("@/server/actions/documents", () => ({
  toggleFavoriteDocumentAction: vi.fn(),
  uploadPdfAction: vi.fn(),
  moveDocumentAction: vi.fn(),
  trashDocumentAction: vi.fn()
}));

vi.mock("@/server/actions/library", () => ({
  createFolderAction: vi.fn(),
  renameFolderAction: vi.fn(),
  moveFolderAction: vi.fn(),
  trashFolderAction: vi.fn(),
  createTagAction: vi.fn(),
  updateTagAction: vi.fn(),
  mergeTagAction: vi.fn(),
  deleteTagAction: vi.fn(),
  updateDocumentTagsAction: vi.fn(),
  restoreTrashItemAction: vi.fn(),
  permanentlyDeleteTrashItemAction: vi.fn(),
  emptyTrashAction: vi.fn(),
  purgeExpiredTrash: vi.fn()
}));

describe("documents hub", () => {
  it("combines search, personal scope, family scope and upload visibility", async () => {
    const { default: DocumentsPage } = await import("@/app/(app)/documents/page");

    const html = renderToStaticMarkup(
      await DocumentsPage({ searchParams: Promise.resolve({}) })
    );

    expect(html).toContain('name="q"');
    expect(html).toContain("Meine Dokumente");
    expect(html).toContain("Familie");
    expect(html).toContain('name="visibility"');
    expect(html).toContain("Neuer Ordner");
    expect(html).toContain("Tags verwalten");
    expect(html).toContain("Papierkorb");
    expect(html).toContain('name="folderId"');
    expect(html).not.toContain("Deep Search");
    expect(html).not.toContain("KI-Tags");
  });
});
