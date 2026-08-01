import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));

const documentFindMany = vi.fn(async (args?: unknown) => {
  const options = args as { distinct?: string[] } | undefined;
  return options?.distinct ? [] : [];
});
const documentCount = vi.fn(async () => 0);

vi.mock("@/server/auth", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1", name: "Mara", role: "user" }))
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { findMany: documentFindMany, count: documentCount },
    folder: {
      findMany: vi.fn(async () => [
        { id: "health", name: "Gesundheit", icon: "heart", parentId: null, position: 0, visibility: "private", isSystem: false, tags: [], _count: { documents: 0 } },
        { id: "okk", name: "ÖKK", icon: "folder", parentId: "health", position: 0, visibility: "private", isSystem: false, tags: [], _count: { documents: 0 } }
      ])
    },
    tag: { findMany: vi.fn(async () => []) },
    householdMember: { findMany: vi.fn(async () => [{ householdId: "family-1" }]) }
  }
}));

vi.mock("@/server/search/search", () => ({
  hybridSearch: vi.fn(async () => ({ results: [], total: 0 }))
}));

vi.mock("@/server/actions/documents", () => ({
  toggleFavoriteDocumentAction: vi.fn(),
  moveDocumentAction: vi.fn(),
  trashDocumentAction: vi.fn()
}));

vi.mock("@/server/actions/library", () => ({
  updateDocumentTagsAction: vi.fn(),
  restoreTrashItemAction: vi.fn(),
  permanentlyDeleteTrashItemAction: vi.fn(),
  emptyTrashAction: vi.fn(),
  purgeExpiredTrash: vi.fn()
}));

describe("recursive document folder view", () => {
  it("queries the selected folder and every descendant", async () => {
    const { default: DocumentsPage } = await import("@/app/(app)/documents/page");
    await DocumentsPage({ searchParams: Promise.resolve({ folder: "health" }) });

    const listCall = documentFindMany.mock.calls.find(([args]) => JSON.stringify(args).includes('"folderId"'));
    expect(listCall?.[0]).toMatchObject({
      where: {
        AND: expect.arrayContaining([
          { folderId: { in: ["health", "okk"] } }
        ])
      }
    });
  });

  it("labels the folder scope as including subfolders", async () => {
    const { default: DocumentsPage } = await import("@/app/(app)/documents/page");
    const html = renderToStaticMarkup(await DocumentsPage({ searchParams: Promise.resolve({ folder: "health" }) }));

    expect(html).toContain("Dokumente inklusive Unterordner");
    expect(html).toContain("Gesundheit");
  });
});
