import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

vi.mock("@/server/auth", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" }))
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findMany: vi.fn(async () => [])
    },
    folder: {
      findMany: vi.fn(async () => [])
    },
    householdMember: {
      findMany: vi.fn(async () => [{ householdId: "family-1" }])
    }
  }
}));

vi.mock("@/server/actions/documents", () => ({
  reindexDocumentAction: vi.fn(),
  uploadPdfAction: vi.fn()
}));

describe("uploads page", () => {
  it("allows selecting or dropping multiple PDF files", async () => {
    const { default: UploadsPage } = await import("@/app/(app)/admin/uploads/page");

    const html = renderToStaticMarkup(await UploadsPage());

    expect(html).toMatch(/<input[^>]*type="file"[^>]*multiple=""/);
  });
});
