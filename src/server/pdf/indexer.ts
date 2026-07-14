import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { chunkPages } from "@/server/pdf/chunk";
import { extractPdfText } from "@/server/pdf/extract";
import { createDocumentThumbnail } from "@/server/pdf/thumbnail";
import { detectYear } from "@/server/pdf/year";
import { hasPdfSignature } from "@/server/pdf/validate";
import { embedText, vectorLiteral } from "@/server/search/embeddings";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";

type SaveUploadedPdfOptions = {
  ownerUserId: string;
  householdId: string;
  visibility: "private" | "family";
  yearOverride?: number;
};

export function storageRoot() {
  return process.env.PDF_STORAGE_PATH ?? path.join(process.cwd(), "storage", "pdfs");
}

export async function saveUploadedPdf(file: File, options: SaveUploadedPdfOptions) {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Nur PDF-Dateien sind erlaubt.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasPdfSignature(buffer)) throw new Error("Die Datei ist keine gültige PDF-Datei.");
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const existing = await prisma.document.findUnique({
    where: {
      ownerUserId_checksum: {
        ownerUserId: options.ownerUserId,
        checksum
      }
    }
  });
  if (existing) return existing;

  const ownerStorageRoot = path.join(storageRoot(), options.ownerUserId);
  await mkdir(ownerStorageRoot, { recursive: true });
  const id = randomUUID();
  const fileName = `${id}.pdf`;
  const storagePath = path.join(ownerStorageRoot, fileName);
  await writeFile(storagePath, buffer);

  const title = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  const year = options.yearOverride ?? detectYear(file.name);

  const document = await prisma.document.create({
    data: {
      id,
      title: title || file.name,
      originalName: file.name,
      year,
      mimeType: "application/pdf",
      size: buffer.byteLength,
      storagePath,
      checksum,
      ownerUserId: options.ownerUserId,
      householdId: options.householdId,
      visibility: options.visibility,
      yearLocked: options.yearOverride !== undefined,
      indexStatus: "queued"
    }
  });

  try {
    await createDocumentThumbnail(document.id, document.storagePath);
  } catch {
    // Thumbnail generation is best-effort; text indexing remains the source of truth for upload success.
  }

  await indexDocument(document.id);
  return document;
}

export async function indexDocument(documentId: string) {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) throw new Error("Dokument nicht gefunden.");

  await prisma.document.update({
    where: { id: documentId },
    data: { indexStatus: "processing", indexError: null }
  });

  try {
    await prisma.textChunk.deleteMany({ where: { documentId } });
    const extracted = await extractPdfText(document.storagePath);
    const allText = extracted.pages.map((page) => page.text).join("\n");
    const detectedYear = document.yearLocked
      ? document.year
      : detectYear(`${document.originalName}\n${allText}`, document.year);
    const chunks = chunkPages(extracted.pages);

    for (const chunk of chunks) {
      const created = await prisma.textChunk.create({
        data: {
          documentId,
          page: chunk.page,
          content: chunk.text
        }
      });

      await prisma.$executeRawUnsafe(
        `UPDATE "TextChunk"
         SET tsv = to_tsvector('simple', $1),
             embedding = $2::vector
         WHERE id = $3`,
        chunk.text,
        vectorLiteral(embedText(chunk.text)),
        created.id
      );
    }

    await prisma.document.update({
      where: { id: documentId },
      data: {
        year: detectedYear,
        pageCount: extracted.pageCount,
        indexStatus: "indexed",
        indexError: null
      }
    });
  } catch (error) {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        indexStatus: "failed",
        indexError: error instanceof Error ? error.message : "Unbekannter Indexierungsfehler"
      }
    });
  }
}

export async function readDocumentFile(documentId: string, userId: string) {
  const householdIds = await householdIdsForUser(userId);
  const document = await prisma.document.findFirst({
    where: { id: documentId, ...documentAccessWhere(userId, householdIds) }
  });
  if (!document) return null;
  const buffer = await readFile(document.storagePath);
  return { document, buffer };
}
