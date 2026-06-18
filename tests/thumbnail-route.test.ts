import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1", role: "user" }))
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findUnique: vi.fn(async () => ({ id: "doc-1", storagePath: "/tmp/doc-1.pdf" }))
    }
  }
}));

vi.mock("@/server/pdf/thumbnail", () => ({
  readOrCreateDocumentThumbnail: vi.fn(async () => Buffer.from("fake-png"))
}));

describe("document thumbnail route", () => {
  it("returns an authenticated PNG thumbnail", async () => {
    const { GET } = await import("@/app/api/documents/[id]/thumbnail/route");

    const response = await GET(new Request("http://localhost/api/documents/doc-1/thumbnail"), {
      params: Promise.resolve({ id: "doc-1" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("fake-png");
  });
});
