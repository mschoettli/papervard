import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

vi.mock("@/server/auth", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1", name: "Mara", role: "user" }))
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    folder: { findMany: vi.fn(async () => []) },
    tag: { findMany: vi.fn(async () => []) },
    householdMember: {
      findMany: vi.fn(async () => [{ householdId: "family-1" }])
    }
  }
}));

vi.mock("@/server/actions/library", () => ({
  createFolderAction: vi.fn(),
  createTagAction: vi.fn(),
  deleteTagAction: vi.fn(),
  mergeTagAction: vi.fn(),
  moveFolderAction: vi.fn(),
  renameFolderAction: vi.fn(),
  reorderFolderAction: vi.fn(),
  trashFolderAction: vi.fn(),
  updateFolderTagsAction: vi.fn(),
  updateTagAction: vi.fn()
}));

describe("folders hub", () => {
  it("renders folder management without document results", async () => {
    const { default: FoldersPage } = await import("@/app/(app)/folders/page");
    const html = renderToStaticMarkup(await FoldersPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Alle Ordner");
    expect(html).toContain("Neuer Ordner");
    expect(html).toContain("Tags verwalten");
    expect(html).toContain('action="/documents"');
    expect(html).not.toContain("Filtern und sortieren");
    expect(html).not.toContain("Dateien hinzufügen");
  });
});
