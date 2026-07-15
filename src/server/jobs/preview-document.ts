import "server-only";

import { prisma } from "@/lib/prisma";
import { createDocumentThumbnail } from "@/server/pdf/thumbnail";
import { createImageThumbnail } from "@/server/previews/image";

export async function prepareDocumentPreview(documentId: string) {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) throw new Error("Dokument nicht gefunden.");
  if (document.format === "pdf") {
    return { kind: "pdf" as const, path: await createDocumentThumbnail(document.id, document.storagePath) };
  }
  if (document.family === "image") {
    return { kind: "image" as const, path: await createImageThumbnail(document.id, document.storagePath) };
  }
  return { kind: "native" as const, path: null };
}
