import "server-only";

import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { ensureStorageLayout, storeImmutableFile } from "@/server/documents/blobs";
import { resolveDocumentFormat } from "@/server/documents/formats";
import { createDocumentVersion } from "@/server/documents/versions";

type EditableImageFormat = "jpeg" | "png" | "webp" | "tiff" | "gif" | "avif";

const IMAGE_OUTPUT_FORMATS = new Map<string, EditableImageFormat>([
  ["jpg", "jpeg"], ["jpeg", "jpeg"], ["png", "png"], ["webp", "webp"],
  ["tif", "tiff"], ["tiff", "tiff"], ["gif", "gif"], ["avif", "avif"]
]);

export type ImageEditOperation = {
  rotate?: 90 | 180 | 270;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
};

export function isTextEditable(document: { originalName: string; mimeType?: string | null }) {
  return resolveDocumentFormat(document.originalName, document.mimeType)?.edit === "text";
}

export function isImageEditable(document: { originalName: string }) {
  const extension = path.extname(document.originalName).slice(1).toLowerCase();
  return IMAGE_OUTPUT_FORMATS.has(extension);
}

async function queueDerivedProcessing(documentId: string, versionId: string) {
  await prisma.processingJob.createMany({ data: [
    { type: "extract", documentId, versionId, stage: "queued" },
    { type: "preview", documentId, versionId, stage: "queued" }
  ] });
}

export async function saveTextEdit(documentId: string, userId: string, content: string, baseVersionId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, originalName: true, mimeType: true }
  });
  if (!document || !isTextEditable(document)) throw new Error("Dieses Format kann nicht als Text bearbeitet werden.");
  if (content.includes("\u0000")) throw new Error("Text enthält ungültige Nullzeichen.");

  const layout = await ensureStorageLayout();
  const stagingPath = path.join(layout.staging, `text-${randomUUID()}.part`);
  try {
    await writeFile(stagingPath, content, { encoding: "utf8", flag: "wx" });
    const blob = await storeImmutableFile(stagingPath);
    const version = await createDocumentVersion({
      documentId,
      ...blob,
      mimeType: document.mimeType,
      source: "web_editor",
      authorUserId: userId,
      expectedCurrentVersionId: baseVersionId,
      preserveCurrentOnConflict: true
    });
    if (!version.isConflict) await queueDerivedProcessing(documentId, version.id);
    return version;
  } finally {
    await rm(stagingPath, { force: true });
  }
}

export async function transformImageFile(sourcePath: string, targetPath: string, originalName: string, operation: ImageEditOperation) {
  const extension = path.extname(originalName).slice(1).toLowerCase();
  const outputFormat = IMAGE_OUTPUT_FORMATS.get(extension);
  if (!outputFormat) throw new Error("Dieses Bildformat kann nicht verlustarm lokal transformiert werden.");
  if (!operation.rotate && !operation.flipHorizontal && !operation.flipVertical) {
    throw new Error("Keine Bildänderung ausgewählt.");
  }

  let pipeline = sharp(sourcePath, { animated: extension === "gif", failOn: "error", sequentialRead: true }).rotate();
  if (operation.rotate) pipeline = pipeline.rotate(operation.rotate);
  if (operation.flipHorizontal) pipeline = pipeline.flop();
  if (operation.flipVertical) pipeline = pipeline.flip();
  await pipeline.withMetadata().toFormat(outputFormat).toFile(targetPath);
}

export async function saveImageEdit(documentId: string, userId: string, operation: ImageEditOperation, baseVersionId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      versions: {
        where: { id: baseVersionId },
        take: 1,
        select: { blob: { select: { storagePath: true } } }
      }
    }
  });
  const baseVersion = document?.versions[0];
  if (!document || !baseVersion || !isImageEditable(document)) throw new Error("Dieses Bildformat oder seine Ausgangsversion kann nicht bearbeitet werden.");

  const layout = await ensureStorageLayout();
  const stagingPath = path.join(layout.staging, `image-${randomUUID()}${path.extname(document.originalName).toLowerCase()}`);
  try {
    await transformImageFile(baseVersion.blob.storagePath, stagingPath, document.originalName, operation);
    const blob = await storeImmutableFile(stagingPath);
    const version = await createDocumentVersion({
      documentId,
      ...blob,
      mimeType: document.mimeType,
      source: "web_editor",
      authorUserId: userId,
      expectedCurrentVersionId: baseVersionId,
      preserveCurrentOnConflict: true
    });
    if (!version.isConflict) await queueDerivedProcessing(documentId, version.id);
    return version;
  } finally {
    await rm(stagingPath, { force: true });
  }
}
