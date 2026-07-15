import "server-only";

import { prisma } from "@/lib/prisma";
import { chunkPages } from "@/server/pdf/chunk";
import { extractPdfText } from "@/server/pdf/extract";
import { detectYear } from "@/server/pdf/year";
import { embedText, vectorLiteral } from "@/server/search/embeddings";

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
