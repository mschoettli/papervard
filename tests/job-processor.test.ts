import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  progress: vi.fn(async () => undefined),
  complete: vi.fn(async () => undefined),
  fail: vi.fn(async () => undefined),
  waitPassword: vi.fn(async () => undefined),
  ingest: vi.fn(async () => ({ id: "doc-1" })),
  extract: vi.fn(async () => ({ chunkCount: 2 }))
}));

vi.mock("@/server/jobs/queue", () => ({
  claimNextJob: mocks.claim,
  updateJobProgress: mocks.progress,
  completeJob: mocks.complete,
  failJob: mocks.fail,
  waitForPassword: mocks.waitPassword
}));
vi.mock("@/server/jobs/ingest", () => ({ ingestUploadSession: mocks.ingest }));
vi.mock("@/server/jobs/extract-document", () => ({ extractDocumentContent: mocks.extract }));
vi.mock("@/server/extract/tika", () => ({
  ProtectedDocumentError: class ProtectedDocumentError extends Error {}
}));

describe("processing worker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims and completes an ingest job", async () => {
    mocks.claim.mockResolvedValue({
      id: "job-1", type: "ingest", uploadSessionId: "upload-1", documentId: null,
      attempts: 1, maxAttempts: 5
    });
    const { processNextJob } = await import("@/server/jobs/processor");

    expect(await processNextJob("worker-1")).toBe(true);
    expect(mocks.ingest).toHaveBeenCalledWith("upload-1");
    expect(mocks.complete).toHaveBeenCalledWith("job-1");
  });

  it("pauses protected extraction jobs for a password", async () => {
    const { ProtectedDocumentError } = await import("@/server/extract/tika");
    mocks.claim.mockResolvedValue({
      id: "job-2", type: "extract", uploadSessionId: null, documentId: "doc-1",
      attempts: 1, maxAttempts: 5
    });
    mocks.extract.mockRejectedValueOnce(new ProtectedDocumentError("Passwort erforderlich"));
    const { processNextJob } = await import("@/server/jobs/processor");

    await processNextJob("worker-1");
    expect(mocks.waitPassword).toHaveBeenCalledWith("job-2", "Passwort erforderlich");
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("returns immediately when the queue is empty", async () => {
    mocks.claim.mockResolvedValue(null);
    const { processNextJob } = await import("@/server/jobs/processor");
    expect(await processNextJob("worker-1")).toBe(false);
  });
});
