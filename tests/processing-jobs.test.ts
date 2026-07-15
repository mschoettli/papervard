import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  raw: vi.fn(async (..._args: unknown[]) => [{ id: "job-1", attempts: 1, maxAttempts: 5 }]),
  update: vi.fn(async (args: unknown) => args)
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: mocks.raw,
    processingJob: { update: mocks.update }
  }
}));

describe("durable processing jobs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims one available job with SKIP LOCKED", async () => {
    const { claimNextJob } = await import("@/server/jobs/queue");
    const job = await claimNextJob("worker-a");

    expect(job?.id).toBe("job-1");
    expect(mocks.raw.mock.calls[0]?.[0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(mocks.raw.mock.calls[0]?.[1]).toBe("worker-a");
  });

  it("clamps progress and stores a restart checkpoint", async () => {
    const { updateJobProgress } = await import("@/server/jobs/queue");
    await updateJobProgress("job-1", 140, "extracting", { page: 7 });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: { progress: 100, stage: "extracting", checkpoint: { page: 7 } }
    });
  });

  it("requeues retryable failures and can pause for a password", async () => {
    const { failJob, waitForPassword } = await import("@/server/jobs/queue");
    await failJob({ id: "job-1", attempts: 1, maxAttempts: 5 }, new Error("converter offline"));
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({ status: "queued", workerId: null, lockedAt: null, error: "converter offline" })
    });

    await waitForPassword("job-1", "Datei ist geschützt");
    expect(mocks.update).toHaveBeenLastCalledWith({
      where: { id: "job-1" },
      data: { status: "awaiting_password", stage: "password", error: "Datei ist geschützt", workerId: null, lockedAt: null }
    });
  });
});
