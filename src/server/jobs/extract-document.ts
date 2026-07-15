import "server-only";

import { prisma } from "@/lib/prisma";
import { indexDicomDocument } from "@/server/dicom/index";
import { extractWithTika } from "@/server/extract/tika";
import { chunkPages } from "@/server/pdf/chunk";
import { detectYear } from "@/server/pdf/year";
import { embedText, vectorLiteral } from "@/server/search/embeddings";

export async function extractDocumentContent(documentId: string) {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) throw new Error("Dokument nicht gefunden.");
  if (document.family === "dicom") {
    const result = await indexDicomDocument(document.id);
    return { chunkCount: 0, metadata: { studyId: result.studyId, seriesId: result.seriesId } };
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { indexStatus: "processing", indexError: null }
  });

  const extracted = await extractWithTika(document.storagePath, document.originalName);
  const chunks = chunkPages([{ page: 1, text: extracted.text }]);
  await prisma.textChunk.deleteMany({ where: { documentId: document.id } });

  for (const chunk of chunks) {
    const created = await prisma.textChunk.create({
      data: {
        documentId: document.id,
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

  const year = document.yearLocked
    ? document.year
    : detectYear(`${document.originalName}\n${extracted.text}`, document.year);
  await prisma.document.update({
    where: { id: document.id },
    data: {
      year,
      pageCount: 1,
      indexStatus: "indexed",
      indexError: null
    }
  });

  return { chunkCount: chunks.length, metadata: extracted.metadata };
}
