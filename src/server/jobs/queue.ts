import "server-only";

import type { Prisma, ProcessingJob } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function claimNextJob(workerId: string) {
  const jobs = await prisma.$queryRawUnsafe<ProcessingJob[]>(`
    WITH next_job AS (
      SELECT "id"
      FROM "ProcessingJob"
      WHERE "status" = 'queued'::"ProcessingJobStatus"
        AND "availableAt" <= CURRENT_TIMESTAMP
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "ProcessingJob" job
    SET "status" = 'processing'::"ProcessingJobStatus",
        "stage" = 'claimed',
        "lockedAt" = CURRENT_TIMESTAMP,
        "workerId" = $1,
        "attempts" = job."attempts" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    FROM next_job
    WHERE job."id" = next_job."id"
    RETURNING job.*
  `, workerId);
  return jobs[0] ?? null;
}

export async function updateJobProgress(
  jobId: string,
  progress: number,
  stage: string,
  checkpoint?: Prisma.InputJsonValue
) {
  return prisma.processingJob.update({
    where: { id: jobId },
    data: {
      progress: Math.max(0, Math.min(100, Math.round(progress))),
      stage,
      ...(checkpoint === undefined ? {} : { checkpoint })
    }
  });
}

export async function completeJob(jobId: string) {
  return prisma.processingJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      progress: 100,
      stage: "completed",
      error: null,
      workerId: null,
      lockedAt: null
    }
  });
}

export async function failJob(
  job: Pick<ProcessingJob, "id" | "attempts" | "maxAttempts">,
  error: unknown,
  retryable = true
) {
  const message = error instanceof Error ? error.message : "Unbekannter Verarbeitungsfehler";
  const canRetry = retryable && job.attempts < job.maxAttempts;
  const delaySeconds = Math.min(300, 2 ** Math.max(0, job.attempts - 1) * 5);
  return prisma.processingJob.update({
    where: { id: job.id },
    data: {
      status: canRetry ? "queued" : "failed",
      stage: canRetry ? "retry" : "failed",
      error: message,
      availableAt: canRetry ? new Date(Date.now() + delaySeconds * 1000) : undefined,
      workerId: null,
      lockedAt: null
    }
  });
}

export async function waitForPassword(jobId: string, message = "Passwort erforderlich") {
  return prisma.processingJob.update({
    where: { id: jobId },
    data: {
      status: "awaiting_password",
      stage: "password",
      error: message,
      workerId: null,
      lockedAt: null
    }
  });
}
