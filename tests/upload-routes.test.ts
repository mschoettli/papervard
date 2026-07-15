import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(async () => ({ id: "upload-1", resumeToken: "secret", offset: 0n, chunkBytes: 8_388_608 })),
  append: vi.fn(async () => 3n),
  complete: vi.fn(async () => ({ id: "upload-1", status: "uploaded" })),
  status: vi.fn(async () => ({ id: "upload-1", status: "uploading", offset: 3n, expectedSize: 12n })),
  resolveFolder: vi.fn(async () => ({ id: "folder-1" }))
}));

vi.mock("@/server/auth", () => ({ requireUser: vi.fn(async () => ({ id: "user-1", role: "user" })) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { householdMember: { findFirst: vi.fn(async () => ({ householdId: "family-1" })) } }
}));
vi.mock("@/server/documents/folders", () => ({ resolveUploadFolder: mocks.resolveFolder }));
vi.mock("@/server/uploads/resumable", () => ({
  createUploadSession: mocks.create,
  appendUploadChunk: mocks.append,
  completeUploadSession: mocks.complete,
  getUploadStatus: mocks.status,
  UPLOAD_CHUNK_BYTES: 8_388_608
}));

describe("resumable upload API", () => {
  it("creates an upload and represents large sizes as decimal strings", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const response = await POST(new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalName: "studie.dcm",
        mimeType: "application/dicom",
        size: "42949672960",
        visibility: "private",
        folderId: "folder-1"
      })
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "upload-1",
      resumeToken: "secret",
      offset: "0",
      chunkBytes: 8_388_608
    });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ expectedSize: 42_949_672_960n }));
  });

  it("appends a binary block at the confirmed offset", async () => {
    const { PATCH } = await import("@/app/api/uploads/[id]/route");
    const response = await PATCH(new Request("http://localhost/api/uploads/upload-1", {
      method: "PATCH",
      headers: { "Upload-Token": "secret", "Upload-Offset": "0" },
      body: Buffer.from("abc")
    }), { params: Promise.resolve({ id: "upload-1" }) });

    expect(response.status).toBe(204);
    expect(response.headers.get("Upload-Offset")).toBe("3");
    expect(mocks.append).toHaveBeenCalledWith("upload-1", "user-1", "secret", 0n, Buffer.from("abc"));
  });

  it("reports progress and queues a completed upload", async () => {
    const route = await import("@/app/api/uploads/[id]/route");
    const headers = { "Upload-Token": "secret" };
    const context = { params: Promise.resolve({ id: "upload-1" }) };

    const statusResponse = await route.HEAD(new Request("http://localhost/api/uploads/upload-1", { method: "HEAD", headers }), context);
    expect(statusResponse.headers.get("Upload-Offset")).toBe("3");
    expect(statusResponse.headers.get("Upload-Length")).toBe("12");

    const completeResponse = await route.POST(new Request("http://localhost/api/uploads/upload-1", { method: "POST", headers }), context);
    expect(completeResponse.status).toBe(202);
    expect(mocks.complete).toHaveBeenCalledWith("upload-1", "user-1", "secret");
  });
});
