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
  uploadPdfAction: vi.fn()
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
    expect(html).not.toContain("Deep Search");
  });
});
