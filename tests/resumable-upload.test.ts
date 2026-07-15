import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: "upload-1", ...args.data })),
  findSession: vi.fn(),
  updateSession: vi.fn(async () => ({ id: "upload-1" })),
  createJob: vi.fn(async () => ({ id: "job-1" }))
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    uploadSession: {
      create: mocks.createSession,
      findUnique: mocks.findSession,
      update: mocks.updateSession
    },
    processingJob: { create: mocks.createJob },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  }
}));

let dataRoot: string;

beforeEach(async () => {
  vi.clearAllMocks();
  dataRoot = await mkdtemp(path.join(tmpdir(), "papervard-upload-"));
  process.env.PAPERVARD_DATA_PATH = dataRoot;
});

afterEach(async () => {
  delete process.env.PAPERVARD_DATA_PATH;
  await rm(dataRoot, { recursive: true, force: true });
});

describe("resumable uploads", () => {
  it("creates a session for a supported format without a total-size ceiling", async () => {
    const { createUploadSession } = await import("@/server/uploads/resumable");

    const session = await createUploadSession({
      ownerUserId: "user-1",
      householdId: "family-1",
      folderId: "folder-1",
      visibility: "family",
      originalName: "riesige-untersuchung.dcm",
      mimeType: "application/dicom",
      expectedSize: 9_223_372_036_854_775_000n
    });

    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.resumeToken.length).toBeGreaterThanOrEqual(32);
    expect(mocks.createSession).toHaveBeenCalledWith({
      data: expect.objectContaining({
        family: "dicom",
        format: "dicom",
        expectedSize: 9_223_372_036_854_775_000n,
        receivedSize: 0n,
        status: "uploading"
      })
    });
  });

  it("appends only at the confirmed offset and returns the next offset", async () => {
    const { appendUploadChunk, hashResumeToken } = await import("@/server/uploads/resumable");
    const stagingPath = path.join(dataRoot, "staging", "upload-1.part");
    await import("node:fs/promises").then(({ mkdir, writeFile }) =>
      mkdir(path.dirname(stagingPath), { recursive: true }).then(() => writeFile(stagingPath, ""))
    );
    mocks.findSession.mockResolvedValue({
      id: "upload-1",
      resumeTokenHash: hashResumeToken("resume-secret"),
      receivedSize: 0n,
      expectedSize: 6n,
      stagingPath,
      status: "uploading",
      ownerUserId: "user-1"
    });

    const offset = await appendUploadChunk("upload-1", "user-1", "resume-secret", 0n, Buffer.from("abc"));

    expect(offset).toBe(3n);
    expect(await readFile(stagingPath, "utf8")).toBe("abc");
    expect(mocks.updateSession).toHaveBeenCalledWith({
      where: { id: "upload-1" },
      data: { receivedSize: 3n }
    });
  });

  it("rejects stale offsets before writing", async () => {
    const { appendUploadChunk, hashResumeToken } = await import("@/server/uploads/resumable");
    mocks.findSession.mockResolvedValue({
      id: "upload-1",
      resumeTokenHash: hashResumeToken("resume-secret"),
      receivedSize: 8n,
      expectedSize: null,
      stagingPath: path.join(dataRoot, "staging", "upload-1.part"),
      status: "uploading",
      ownerUserId: "user-1"
    });

    await expect(appendUploadChunk("upload-1", "user-1", "resume-secret", 0n, Buffer.from("abc")))
      .rejects.toThrow("Upload-Offset ist nicht mehr aktuell");
  });

  it("does not let another user resume an upload even with its token", async () => {
    const { appendUploadChunk, hashResumeToken } = await import("@/server/uploads/resumable");
    mocks.findSession.mockResolvedValue({
      id: "upload-1",
      resumeTokenHash: hashResumeToken("resume-secret"),
      receivedSize: 0n,
      expectedSize: null,
      stagingPath: path.join(dataRoot, "staging", "upload-1.part"),
      status: "uploading",
      ownerUserId: "user-1"
    });

    await expect(appendUploadChunk("upload-1", "user-2", "resume-secret", 0n, Buffer.from("abc")))
      .rejects.toThrow("Upload-Sitzung nicht gefunden");
  });
});
