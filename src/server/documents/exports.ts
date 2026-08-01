import "server-only";

import type { User } from "@prisma/client";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { householdIdsForUser } from "@/server/documents/access";
import { resolveDocumentSelection } from "@/server/documents/bulk-selection";
import { buildDocumentExportPaths } from "@/server/documents/export-paths";
import { folderAccessWhere } from "@/server/documents/folders";
import { storageLayout } from "@/server/documents/blobs";
import { writeZipArchive } from "@/server/documents/zip-export";

const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

export async function createDocumentExport(user: Pick<User, "id" | "role">, selection: unknown) {
  const active = await prisma.documentExport.count({
    where: { ownerUserId: user.id, status: { in: ["queued", "processing"] } }
  });
  if (active >= 3) throw new Error("Es warten bereits drei Exporte. Bitte warte, bis ein Auftrag abgeschlossen ist.");

  const documents = await resolveDocumentSelection(user, selection);
  if (documents.length === 0) throw new Error("Keine zugänglichen Dokumente ausgewählt.");
  const householdIds = await householdIdsForUser(user.id);
  const folders = await prisma.folder.findMany({
    where: folderAccessWhere(user.id, householdIds, user.role === "admin"),
    select: { id: true, name: true, parentId: true }
  });
  const paths = new Map(buildDocumentExportPaths(folders, documents).map((item) => [item.documentId, item.relativePath]));
  const snapshotItems = documents.map((document) => ({
    documentId: document.id,
    versionId: document.currentVersionId,
    sourcePath: document.currentVersion?.blob.storagePath ?? document.storagePath,
    relativePath: paths.get(document.id) ?? `Papervard-Export/${document.id}`,
    size: document.currentVersion?.blob.size ?? document.size
  }));
  const snapshotBatches = chunkItems(snapshotItems, 1000);

  return prisma.$transaction(async (transaction) => {
    const created = await transaction.documentExport.create({
      data: { ownerUserId: user.id, totalItems: documents.length }
    });
    for (const batch of snapshotBatches) {
      await transaction.documentExportItem.createMany({
        data: batch.map((snapshot) => ({ exportId: created.id, ...snapshot }))
      });
    }
    await transaction.processingJob.create({
      data: { type: "document_export", exportId: created.id, stage: "queued", maxAttempts: 3 }
    });
    return serializeDocumentExport(created);
  }, { maxWait: 10_000, timeout: 60_000 });
}

export async function listDocumentExports(user: Pick<User, "id" | "role">) {
  await purgeExpiredDocumentExports();
  const exports = await prisma.documentExport.findMany({
    where: user.role === "admin" ? {} : { ownerUserId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  return exports.map(serializeDocumentExport);
}

export async function documentExportForUser(user: Pick<User, "id" | "role">, exportId: string) {
  return prisma.documentExport.findFirst({
    where: { id: exportId, ...(user.role === "admin" ? {} : { ownerUserId: user.id }) }
  });
}

export async function retryDocumentExport(user: Pick<User, "id" | "role">, exportId: string) {
  const item = await documentExportForUser(user, exportId);
  if (!item) throw new Error("Export nicht gefunden.");
  if (!(["failed", "canceled"] as string[]).includes(item.status)) throw new Error("Nur fehlgeschlagene Exporte können wiederholt werden.");
  if (item.outputPath) await rm(item.outputPath, { force: true });
  await prisma.$transaction([
    prisma.documentExportItem.updateMany({ where: { exportId }, data: { status: "queued", error: null } }),
    prisma.documentExport.update({
      where: { id: exportId },
      data: { status: "queued", progress: 0, completedItems: 0, skippedItems: 0, outputPath: null, outputSize: null, error: null, warnings: undefined, completedAt: null, expiresAt: null }
    }),
    prisma.processingJob.update({
      where: { exportId },
      data: { status: "queued", progress: 0, stage: "queued", attempts: 0, error: null, availableAt: new Date(), lockedAt: null, workerId: null }
    })
  ]);
  const refreshed = await documentExportForUser(user, exportId);
  if (!refreshed) throw new Error("Export nicht gefunden.");
  return serializeDocumentExport(refreshed);
}

export async function deleteDocumentExport(user: Pick<User, "id" | "role">, exportId: string) {
  const item = await documentExportForUser(user, exportId);
  if (!item) throw new Error("Export nicht gefunden.");
  if (item.status === "queued" || item.status === "processing") throw new Error("Ein laufender Export kann nicht entfernt werden.");
  if (item.outputPath) await rm(item.outputPath, { force: true });
  await prisma.documentExport.delete({ where: { id: item.id } });
}

export async function purgeExpiredDocumentExports(now = new Date()) {
  const expired = await prisma.documentExport.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true, outputPath: true }
  });
  for (const item of expired) if (item.outputPath) await rm(item.outputPath, { force: true });
  if (expired.length > 0) await prisma.documentExport.deleteMany({ where: { id: { in: expired.map((item) => item.id) } } });
  return expired.length;
}

export function serializeDocumentExport(item: {
  id: string;
  status: string;
  progress: number;
  totalItems: number;
  completedItems: number;
  skippedItems: number;
  outputSize: bigint | null;
  error: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: item.id,
    status: item.status,
    progress: item.progress,
    totalItems: item.totalItems,
    completedItems: item.completedItems,
    skippedItems: item.skippedItems,
    outputSize: item.outputSize?.toString() ?? null,
    error: item.error,
    expiresAt: item.expiresAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString()
  };
}

export async function processDocumentExport(exportId: string, onProgress?: (progress: number, stage: string) => Promise<void>) {
  const item = await prisma.documentExport.findUnique({
    where: { id: exportId },
    include: { items: { orderBy: { createdAt: "asc" } } }
  });
  if (!item) throw new Error("Export nicht gefunden.");
  const exportsDirectory = storageLayout().exports;
  const partPath = path.join(exportsDirectory, `${item.id}.zip.part`);
  const finalPath = path.join(exportsDirectory, `${item.id}.zip`);
  await mkdir(exportsDirectory, { recursive: true });
  await Promise.all([rm(partPath, { force: true }), rm(finalPath, { force: true })]);
  await prisma.documentExport.update({ where: { id: item.id }, data: { status: "processing", progress: 0, error: null } });

  try {
    let lastProgress = -1;
    const result = await writeZipArchive(item.items, partPath, async (completed, total) => {
      const progress = total === 0 ? 100 : Math.min(99, Math.round((completed / total) * 100));
      if (progress === lastProgress) return;
      lastProgress = progress;
      await prisma.documentExport.update({ where: { id: item.id }, data: { progress } });
      await onProgress?.(progress, "archiving");
    });
    await rename(partPath, finalPath);
    const output = await stat(finalPath);
    const completedAt = new Date();
    const skippedIds = result.skipped.map((skipped) => skipped.id);
    const completedItemBatches = chunkItems(result.completedItemIds, 1000);
    for (const batch of completedItemBatches) {
      await prisma.documentExportItem.updateMany({ where: { id: { in: batch } }, data: { status: "completed", error: null } });
    }
    for (const batch of chunkItems(result.skipped, 100)) {
      await prisma.$transaction(batch.map((skipped) => prisma.documentExportItem.update({
        where: { id: skipped.id },
        data: { status: "skipped", error: skipped.error }
      })));
    }
    await prisma.documentExport.update({
      where: { id: item.id },
      data: {
        status: skippedIds.length > 0 ? "completed_with_warnings" : "completed",
        progress: 100,
        completedItems: result.completedItemIds.length,
        skippedItems: skippedIds.length,
        outputPath: finalPath,
        outputSize: BigInt(output.size),
        warnings: result.skipped,
        error: null,
        completedAt,
        expiresAt: new Date(completedAt.getTime() + EXPORT_TTL_MS)
      }
    });
    await onProgress?.(100, "completed");
  } catch (error) {
    await rm(partPath, { force: true });
    await prisma.documentExport.update({
      where: { id: item.id },
      data: { status: "failed", error: "ZIP konnte nicht erstellt werden." }
    });
    console.error(`Dokumentexport ${item.id} fehlgeschlagen:`, error);
    throw error;
  }
}

export function openDocumentExportStream(outputPath: string) {
  return createReadStream(outputPath);
}

function chunkItems<T>(items: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}
