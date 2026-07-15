import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findAccessibleDocumentFile: vi.fn(),
  thumbnail: vi.fn(async () => Buffer.from("fake-png"))
}));

vi.mock("@/server/auth", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1", role: "user" }))
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findUnique: mocks.findUnique,
      findFirst: mocks.findFirst
    },
    householdMember: {
      findFirst: vi.fn(async () => null)
    }
  }
}));

vi.mock("@/server/pdf/thumbnail", () => ({
  readOrCreateDocumentThumbnail: mocks.thumbnail
}));

vi.mock("@/server/documents/file", () => ({
  findAccessibleDocumentFile: mocks.findAccessibleDocumentFile
}));

describe("document file authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({
      id: "doc-1",
      storagePath: "/tmp/doc-1.pdf",
      ownerUserId: "user-2",
      householdId: "family-2",
      visibility: "private"
    });
    mocks.findFirst.mockResolvedValue(null);
    mocks.findAccessibleDocumentFile.mockImplementation(async (_id: string, userId?: string) =>
      userId
        ? null
        : {
            document: { id: "doc-1", originalName: "private.pdf", ownerUserId: "user-2" },
            buffer: Buffer.from("private")
          }
    );
  });

  it("does not expose another user's private thumbnail", async () => {
    const { GET } = await import("@/app/api/documents/[id]/thumbnail/route");

    const response = await GET(new Request("http://localhost/api/documents/doc-1/thumbnail"), {
      params: Promise.resolve({ id: "doc-1" })
    });

    expect(response.status).toBe(404);
    expect(mocks.thumbnail).not.toHaveBeenCalled();
  });

  it("does not expose another user's private PDF", async () => {
    const { GET } = await import("@/app/api/documents/[id]/file/route");

    const response = await GET(new Request("http://localhost/api/documents/doc-1/file"), {
      params: Promise.resolve({ id: "doc-1" })
    });

    expect(response.status).toBe(404);
    expect(mocks.findAccessibleDocumentFile).toHaveBeenCalledWith("doc-1", "user-1", false);
  });
});
