import "server-only";

import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, open, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { storageLayout, storeImmutableFile } from "@/server/documents/blobs";
import { resolveDocumentFormat, validateFormatSignature } from "@/server/documents/formats";
import { createDocumentVersion } from "@/server/documents/versions";
import { attachDicomInstance } from "@/server/dicom/index";
import { readDicomMetadata, type DicomMetadata } from "@/server/dicom/metadata";
import { ProtectedDocumentError } from "@/server/extract/tika";
import { detectYear } from "@/server/pdf/year";

const execFileAsync = promisify(execFile);

export function validateArchiveEntries(entries: string[]) {
  return entries.map((entry) => {
    const normalized = entry.replace(/\\/g, "/");
    if (path.posix.isAbsolute(normalized) || normalized.split("/").some((segment) => segment === "..")) {
      throw new Error(`Archiv enthält einen unsicheren Pfad: ${entry}`);
    }
    return normalized.replace(/^\.\//, "");
  });
}

async function extractedFiles(root: string, current = root): Promise<Array<{ absolutePath: string; relativePath: string }>> {
  const result: Array<{ absolutePath: string; relativePath: string }> = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath);
    validateArchiveEntries([relativePath]);
    const info = await lstat(absolutePath);
    if (info.isSymbolicLink()) continue;
    if (entry.isDirectory()) result.push(...await extractedFiles(root, absolutePath));
    else if (entry.isFile()) result.push({ absolutePath, relativePath: relativePath.replace(/\\/g, "/") });
  }
  return result;
}

async function validateExtractedFile(filePath: string, fileName: string, mimeType: string) {
  const format = resolveDocumentFormat(fileName, mimeType);
  if (!format) return null;
  const file = await open(filePath, "r");
  try {
    const header = Buffer.alloc(4096);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (!validateFormatSignature(format, header.subarray(0, bytesRead))) return null;
  } finally {
    await file.close();
  }
  return format;
}

export async function importArchiveCollection(
  documentId: string,
  onProgress?: (progress: number, stage: string) => Promise<void>,
  password?: string
) {
  const source = await prisma.document.findUnique({ where: { id: documentId } });
  if (!source || source.family !== "archive") throw new Error("Archivdokument nicht gefunden.");
  const layout = storageLayout();
  await mkdir(layout.staging, { recursive: true });
  const workDirectory = await mkdtemp(path.join(layout.staging, "collection-"));
  try {
    await onProgress?.(5, "archive-extracting");
    try {
      await execFileAsync("bsdtar", [
        "--no-same-owner",
        "--no-same-permissions",
        ...(password ? ["--passphrase", password] : []),
        "-xf", source.storagePath, "-C", workDirectory
      ], {
        timeout: 24 * 60 * 60 * 1000,
        maxBuffer: 1024 * 1024
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (password || /passphrase|password|encrypted/i.test(message)) throw new ProtectedDocumentError("Archiv ist geschützt oder das Passwort ist falsch.");
      throw new Error("Archiv konnte lokal nicht entpackt werden.");
    }

    const files = await extractedFiles(workDirectory);
    const collection = await prisma.collection.create({
      data: {
        name: source.title,
        householdId: source.householdId,
        createdByUserId: source.ownerUserId,
        visibility: source.visibility
      }
    });
    let position = 0;
    let processed = 0;
    const dicomStudies = new Map<string, { id: string }>();
    for (const item of files) {
      const fileName = path.basename(item.relativePath);
      const candidate = resolveDocumentFormat(fileName);
      const mimeType = candidate?.mimeTypes?.[0] ?? "application/octet-stream";
      const format = await validateExtractedFile(item.absolutePath, fileName, mimeType);
      if (!format) {
        processed += 1;
        continue;
      }
      const blob = await storeImmutableFile(item.absolutePath);
      let dicomMetadata: DicomMetadata | undefined;
      if (format.family === "dicom") {
        dicomMetadata = await readDicomMetadata(blob.storagePath);
        let groupedDocument = dicomStudies.get(dicomMetadata.studyInstanceUid);
        if (!groupedDocument) {
          const existingStudy = await prisma.dicomStudy.findFirst({
            where: {
              studyInstanceUid: dicomMetadata.studyInstanceUid,
              document: {
                ownerUserId: source.ownerUserId,
                householdId: source.householdId,
                visibility: source.visibility,
                deletedAt: null
              }
            },
            select: { document: { select: { id: true } } }
          });
          groupedDocument = existingStudy?.document;
        }
        if (groupedDocument) {
          const firstItemForStudy = !dicomStudies.has(dicomMetadata.studyInstanceUid);
          await attachDicomInstance(groupedDocument.id, {
            ...blob,
            mimeType,
            actorUserId: source.ownerUserId,
            logContentChange: true
          }, dicomMetadata);
          dicomStudies.set(dicomMetadata.studyInstanceUid, groupedDocument);
          if (firstItemForStudy) {
            await prisma.collectionItem.upsert({
              where: { collectionId_documentId: { collectionId: collection.id, documentId: groupedDocument.id } },
              update: { relativePath: item.relativePath, position },
              create: { collectionId: collection.id, documentId: groupedDocument.id, relativePath: item.relativePath, position }
            });
            position += 1;
          }
          processed += 1;
          await onProgress?.(Math.min(95, 10 + Math.round((processed / Math.max(1, files.length)) * 85)), "collection-importing");
          continue;
        }
      }

      let child: { id: string } | null = await prisma.document.findFirst({
        where: { ownerUserId: source.ownerUserId, checksum: blob.checksum, deletedAt: null }
      });
      if (!child) {
        child = await prisma.document.create({
          data: {
            title: fileName.slice(0, Math.max(1, fileName.length - path.extname(fileName).length)).replace(/[_-]+/g, " ").trim(),
            originalName: fileName,
            year: detectYear(fileName),
            family: format.family,
            format: format.id,
            mimeType,
            size: blob.size,
            storagePath: blob.storagePath,
            checksum: blob.checksum,
            ownerUserId: source.ownerUserId,
            householdId: source.householdId,
            visibility: source.visibility,
            folderId: source.folderId,
            indexStatus: "queued"
          }
        });
        const version = await createDocumentVersion({
          documentId: child.id,
          checksum: blob.checksum,
          size: blob.size,
          storagePath: blob.storagePath,
          mimeType,
          source: "upload",
          authorUserId: source.ownerUserId
        });
        if (format.family === "dicom" && dicomMetadata) {
          await attachDicomInstance(child.id, { ...blob, mimeType }, dicomMetadata);
          dicomStudies.set(dicomMetadata.studyInstanceUid, child);
        }
        await prisma.processingJob.createMany({ data: [
          ...(format.family === "archive"
            ? [{ type: "import_collection" as const, documentId: child.id, versionId: version.id, stage: "queued" }]
            : format.family === "dicom"
              ? []
              : [{ type: "extract" as const, documentId: child.id, versionId: version.id, stage: "queued" }]),
          { type: "preview", documentId: child.id, versionId: version.id, stage: "queued" }
        ] });
      }
      await prisma.collectionItem.upsert({
        where: { collectionId_documentId: { collectionId: collection.id, documentId: child.id } },
        update: { relativePath: item.relativePath, position },
        create: { collectionId: collection.id, documentId: child.id, relativePath: item.relativePath, position }
      });
      position += 1;
      processed += 1;
      await onProgress?.(Math.min(95, 10 + Math.round((processed / Math.max(1, files.length)) * 85)), "collection-importing");
    }
    return { collectionId: collection.id, imported: position, discovered: files.length };
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}
