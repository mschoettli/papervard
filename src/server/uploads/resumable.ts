import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { appendFile, open, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { DocumentVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureStorageLayout } from "@/server/documents/blobs";
import { resolveDocumentFormat } from "@/server/documents/formats";

export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export type CreateUploadSessionInput = {
  ownerUserId: string;
  householdId: string;
  folderId?: string;
  visibility: DocumentVisibility;
  originalName: string;
  mimeType: string;
  expectedSize?: bigint;
};

export function hashResumeToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function tokenMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashResumeToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createUploadSession(input: CreateUploadSessionInput) {
  const format = resolveDocumentFormat(input.originalName, input.mimeType);
  if (!format) throw new Error("Dieses Dateiformat wird nicht unterstützt.");
  if (input.expectedSize !== undefined && input.expectedSize < 0n) throw new Error("Ungültige Dateigröße.");

  const layout = await ensureStorageLayout();
  const id = randomUUID();
  const resumeToken = randomBytes(32).toString("base64url");
  const stagingPath = path.join(layout.staging, `${id}.part`);
  const file = await open(stagingPath, "wx");
  await file.close();

  try {
    const session = await prisma.uploadSession.create({
      data: {
        id,
        ownerUserId: input.ownerUserId,
        householdId: input.householdId,
        folderId: input.folderId,
        visibility: input.visibility,
        originalName: input.originalName,
        mimeType: input.mimeType || "application/octet-stream",
        format: format.id,
        family: format.family,
        expectedSize: input.expectedSize,
        receivedSize: 0n,
        stagingPath,
        resumeTokenHash: hashResumeToken(resumeToken),
        status: "uploading",
        expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS)
      }
    });
    return { id: session.id, resumeToken, offset: 0n, chunkBytes: UPLOAD_CHUNK_BYTES };
  } catch (error) {
    await rm(stagingPath, { force: true });
    throw error;
  }
}

export async function appendUploadChunk(
  uploadId: string,
  ownerUserId: string,
  resumeToken: string,
  expectedOffset: bigint,
  chunk: Buffer
) {
  if (chunk.byteLength === 0) return expectedOffset;
  if (chunk.byteLength > UPLOAD_CHUNK_BYTES) throw new Error("Der Upload-Block ist zu groß.");

  const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
  if (!session || session.ownerUserId !== ownerUserId || session.status !== "uploading") {
    throw new Error("Upload-Sitzung nicht gefunden oder nicht mehr aktiv.");
  }
  if (!tokenMatches(resumeToken, session.resumeTokenHash)) throw new Error("Ungültiger Wiederaufnahme-Token.");
  if (session.receivedSize !== expectedOffset) throw new Error("Upload-Offset ist nicht mehr aktuell.");

  const fileSize = BigInt((await stat(session.stagingPath)).size);
  if (fileSize !== session.receivedSize) throw new Error("Upload-Zwischenspeicher ist nicht konsistent.");
  const nextOffset = session.receivedSize + BigInt(chunk.byteLength);
  if (session.expectedSize !== null && nextOffset > session.expectedSize) {
    throw new Error("Der Upload ist größer als angekündigt.");
  }

  await appendFile(session.stagingPath, chunk);
  await prisma.uploadSession.update({
    where: { id: session.id },
    data: { receivedSize: nextOffset }
  });
  return nextOffset;
}

export async function completeUploadSession(uploadId: string, ownerUserId: string, resumeToken: string) {
  const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
  if (!session || session.ownerUserId !== ownerUserId || session.status !== "uploading") {
    throw new Error("Upload-Sitzung nicht gefunden oder nicht mehr aktiv.");
  }
  if (!tokenMatches(resumeToken, session.resumeTokenHash)) throw new Error("Ungültiger Wiederaufnahme-Token.");
  if (session.expectedSize !== null && session.receivedSize !== session.expectedSize) {
    throw new Error("Der Upload ist noch nicht vollständig.");
  }

  await prisma.$transaction([
    prisma.uploadSession.update({ where: { id: session.id }, data: { status: "uploaded" } }),
    prisma.processingJob.create({
      data: {
        type: "ingest",
        status: "queued",
        uploadSessionId: session.id,
        progress: 0,
        stage: "uploaded"
      }
    })
  ]);
  return { id: session.id, status: "uploaded" as const };
}

export async function getUploadStatus(uploadId: string, ownerUserId: string, resumeToken: string) {
  const session = await prisma.uploadSession.findUnique({
    where: { id: uploadId },
    include: { processingJobs: { orderBy: { createdAt: "asc" } } }
  });
  if (!session || session.ownerUserId !== ownerUserId || !tokenMatches(resumeToken, session.resumeTokenHash)) {
    throw new Error("Upload-Sitzung nicht gefunden.");
  }
  const sessionJobs = session.processingJobs ?? [];
  const activeJobs = sessionJobs.filter((job) => job.type !== "ingest");
  const jobs = activeJobs.length > 0 ? activeJobs : sessionJobs;
  const failed = jobs.find((job) => job.status === "failed");
  const awaitingPassword = jobs.find((job) => job.status === "awaiting_password");
  const unfinished = jobs.some((job) => job.status === "queued" || job.status === "processing" || job.status === "paused");
  const processingProgress = jobs.length > 0
    ? Math.round(jobs.reduce((sum, job) => sum + job.progress, 0) / jobs.length)
    : session.status === "completed" ? 100 : 0;
  const effectiveStatus = failed ? "failed"
    : awaitingPassword ? "awaiting_password"
      : unfinished || session.status === "uploaded" || session.status === "processing" ? "processing"
        : session.status;
  return {
    id: session.id,
    status: effectiveStatus,
    offset: session.receivedSize,
    expectedSize: session.expectedSize,
    processingProgress,
    stage: awaitingPassword?.stage ?? failed?.stage ?? jobs.find((job) => job.status === "processing")?.stage ?? effectiveStatus,
    error: awaitingPassword?.error ?? failed?.error ?? null
  };
}
