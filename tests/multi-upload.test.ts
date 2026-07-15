import { beforeEach, describe, expect, it, vi } from "vitest";

const saveUploadedPdf = vi.fn(async () => ({ id: "document" }));
const findUnique = vi.fn(async () => null);
const resolveUploadFolder = vi.fn(async () => ({ id: "folder-1" }));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/server/auth", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
  requireUser: vi.fn(async () => ({ id: "user-1" }))
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findUnique
    },
    householdMember: {
      findFirst: vi.fn(async () => ({ householdId: "family-1" }))
    }
  }
}));

vi.mock("@/server/pdf/indexer", () => ({
  indexDocument: vi.fn(),
  saveUploadedPdf
}));

vi.mock("@/server/documents/folders", () => ({
  resolveUploadFolder
}));

describe("uploadPdfAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads every PDF selected in one submission", async () => {
    const { uploadPdfAction } = await import("@/server/actions/documents");
    const formData = new FormData();
    const first = new File(["first"], "rechnung-2024.pdf", { type: "application/pdf" });
    const second = new File(["second"], "vertrag-2023.pdf", { type: "application/pdf" });

    formData.append("file", first);
    formData.append("file", second);
    formData.set("year", "2024");
    formData.set("visibility", "family");
    formData.set("folderId", "folder-1");

    await uploadPdfAction(formData);

    expect(saveUploadedPdf).toHaveBeenCalledTimes(2);
    expect(saveUploadedPdf).toHaveBeenNthCalledWith(1, first, {
      ownerUserId: "user-1",
      householdId: "family-1",
      visibility: "family",
      yearOverride: 2024,
      folderId: "folder-1"
    });
    expect(saveUploadedPdf).toHaveBeenNthCalledWith(2, second, {
      ownerUserId: "user-1",
      householdId: "family-1",
      visibility: "family",
      yearOverride: 2024,
      folderId: "folder-1"
    });
    expect(resolveUploadFolder).toHaveBeenCalledWith({
      requestedFolderId: "folder-1",
      userId: "user-1",
      householdId: "family-1",
      visibility: "family"
    });
  });
});
