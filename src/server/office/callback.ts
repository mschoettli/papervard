import "server-only";

import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { open, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prisma } from "@/lib/prisma";
import { ensureStorageLayout, storeImmutableFile } from "@/server/documents/blobs";
import { resolveDocumentFormat, validateFormatSignature } from "@/server/documents/formats";
import { createDocumentVersion } from "@/server/documents/versions";

type SaveOnlyOfficeVersionInput = {
  documentId: string;
  userId: string;
  downloadUrl: string;
};

function assertOnlyOfficeUrl(value: string) {
  const allowed = new URL(process.env.ONLYOFFICE_INTERNAL_URL ?? "http://onlyoffice");
  const supplied = new URL(value);
  if (allowed.origin !== supplied.origin) {
    throw new Error("ONLYOFFICE-Rückgabe verweist auf einen nicht erlaubten Server.");
  }
  return supplied.toString();
}

async function validateSavedFormat(filePath: string, originalName: string, mimeType: string) {
  const format = resolveDocumentFormat(originalName, mimeType);
  if (!format) throw new Error("ONLYOFFICE hat ein nicht unterstütztes Format zurückgegeben.");
  const file = await open(filePath, "r");
  try {
    const header = Buffer.alloc(4096);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (!validateFormatSignature(format, header.subarray(0, bytesRead))) {
      throw new Error("ONLYOFFICE-Rückgabe besitzt eine ungültige Dateisignatur.");
    }
  } finally {
    await file.close();
  }
}

export async function saveOnlyOfficeVersion(input: SaveOnlyOfficeVersionInput) {
  const downloadUrl = assertOnlyOfficeUrl(input.downloadUrl);
  const document = await prisma.document.findUnique({
    where: { id: input.documentId },
    select: { id: true, originalName: true, mimeType: true }
  });
  if (!document) throw new Error("Dokument nicht gefunden.");

  const layout = await ensureStorageLayout();
  const stagingPath = path.join(layout.staging, `office-${randomUUID()}.part`);
  try {
    const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!response.ok || !response.body) {
      throw new Error(`ONLYOFFICE-Datei konnte nicht geladen werden (${response.status}).`);
    }
    await pipeline(
      Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
      createWriteStream(stagingPath, { flags: "wx" })
    );
    await validateSavedFormat(stagingPath, document.originalName, document.mimeType);
    const blob = await storeImmutableFile(stagingPath);
    const version = await createDocumentVersion({
      documentId: document.id,
      checksum: blob.checksum,
      size: blob.size,
      storagePath: blob.storagePath,
      mimeType: document.mimeType,
      source: "web_editor",
      authorUserId: input.userId
    });
    await prisma.processingJob.createMany({
      data: [
        { type: "extract", documentId: document.id, versionId: version.id, stage: "queued" },
        { type: "preview", documentId: document.id, versionId: version.id, stage: "queued" }
      ]
    });
    return version;
  } finally {
    await rm(stagingPath, { force: true });
  }
}
