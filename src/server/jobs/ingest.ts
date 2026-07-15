import "server-only";

import { open, rm, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { storeImmutableFile } from "@/server/documents/blobs";
import { resolveDocumentFormat, validateFormatSignature } from "@/server/documents/formats";
import { createDocumentVersion } from "@/server/documents/versions";
import { attachDicomInstance } from "@/server/dicom/index";
import { readDicomMetadata } from "@/server/dicom/metadata";
import { detectYear } from "@/server/pdf/year";

const SIGNATURE_HEADER_BYTES = 4096;

function documentTitle(fileName: string) {
  const extension = path.extname(fileName);
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  return baseName.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Ohne Titel";
}

async function readSignatureHeader(filePath: string) {
  const file = await open(filePath, "r");
  try {
    const header = Buffer.alloc(SIGNATURE_HEADER_BYTES);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

export async function ingestUploadSession(uploadSessionId: string) {
  const session = await prisma.uploadSession.findUnique({ where: { id: uploadSessionId } });
  if (!session || session.status !== "uploaded") {
    throw new Error("Upload ist nicht bereit für die Verarbeitung.");
  }
  if (!session.folderId) throw new Error("Für den Upload wurde kein Zielordner festgelegt.");

  const sourceStat = await stat(session.stagingPath);
  if (!sourceStat.isFile() || BigInt(sourceStat.size) !== session.receivedSize) {
    throw new Error("Upload-Zwischenspeicher ist nicht konsistent.");
  }

  const format = resolveDocumentFormat(session.originalName, session.mimeType);
  if (!format || format.id !== session.format || format.family !== session.family) {
    throw new Error("Das erkannte Dateiformat stimmt nicht mit dem Upload überein.");
  }

  const header = await readSignatureHeader(session.stagingPath);
  if (!validateFormatSignature(format, header)) {
    throw new Error(`Dateisignatur passt nicht zum Format ${format.label}.`);
  }

  await prisma.uploadSession.update({
    where: { id: session.id },
    data: { status: "processing", error: null }
  });

  const blob = await storeImmutableFile(session.stagingPath);
  const existing = await prisma.document.findFirst({
    where: {
      ownerUserId: session.ownerUserId,
      checksum: blob.checksum,
      deletedAt: null
    }
  });
  if (existing) {
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "completed", error: null }
    });
    await rm(session.stagingPath, { force: true });
    return existing;
  }

  if (format.family === "dicom") {
    const metadata = await readDicomMetadata(blob.storagePath);
    const matchingStudy = await prisma.dicomStudy.findFirst({
      where: {
        studyInstanceUid: metadata.studyInstanceUid,
        document: {
          ownerUserId: session.ownerUserId,
          householdId: session.householdId,
          visibility: session.visibility,
          deletedAt: null
        }
      },
      select: { document: true }
    });
    if (matchingStudy) {
      await attachDicomInstance(matchingStudy.document.id, {
        ...blob,
        mimeType: session.mimeType || "application/dicom",
        actorUserId: session.ownerUserId,
        logContentChange: true
      }, metadata);
      await prisma.uploadSession.update({
        where: { id: session.id },
        data: { status: "completed", error: null }
      });
      await rm(session.stagingPath, { force: true });
      return matchingStudy.document;
    }
  }

  const mimeType = session.mimeType || "application/octet-stream";
  const document = await prisma.document.create({
    data: {
      title: documentTitle(session.originalName),
      originalName: session.originalName,
      year: detectYear(session.originalName),
      yearLocked: false,
      family: session.family,
      format: session.format,
      mimeType,
      size: blob.size,
      storagePath: blob.storagePath,
      checksum: blob.checksum,
      indexStatus: "queued",
      ownerUserId: session.ownerUserId,
      householdId: session.householdId,
      visibility: session.visibility,
      folderId: session.folderId
    }
  });

  const version = await createDocumentVersion({
    documentId: document.id,
    checksum: blob.checksum,
    size: blob.size,
    storagePath: blob.storagePath,
    mimeType,
    source: "upload",
    authorUserId: session.ownerUserId
  });

  await prisma.processingJob.createMany({
    data: [
      {
        type: format.family === "archive" ? "import_collection" : "extract",
        status: "queued",
        documentId: document.id,
        versionId: version.id,
        uploadSessionId: session.id,
        progress: 0,
        stage: "queued"
      },
      {
        type: "preview",
        status: "queued",
        documentId: document.id,
        versionId: version.id,
        uploadSessionId: session.id,
        progress: 0,
        stage: "queued"
      }
    ]
  });

  await prisma.uploadSession.update({
    where: { id: session.id },
    data: { status: "completed", error: null }
  });
  await rm(session.stagingPath, { force: true });
  return document;
}
