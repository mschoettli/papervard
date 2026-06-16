import "server-only";

import { prisma } from "@/lib/prisma";
import { embedText, vectorLiteral } from "@/server/search/embeddings";
import { combineRank, makeExcerpt } from "@/server/search/ranking";

type RawSearchRow = {
  chunk_id: string;
  document_id: string;
  title: string;
  year: number;
  page: number;
  content: string;
  keyword_rank: number | null;
  semantic_rank: number | null;
};

export async function hybridSearch(query: string, year?: number) {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];

  const embedding = vectorLiteral(embedText(cleanQuery));
  const yearFilter = year && Number.isInteger(year) ? year : null;

  const rows = await prisma.$queryRawUnsafe<RawSearchRow[]>(`
    WITH q AS (
      SELECT
        plainto_tsquery('simple', $1) AS tsq,
        $2::vector AS embedding
    ),
    ranked AS (
      SELECT
        c.id AS chunk_id,
        d.id AS document_id,
        d.title,
        d.year,
        c.page,
        c.content,
        ts_rank_cd(c.tsv, q.tsq) AS keyword_rank,
        1 - (c.embedding <=> q.embedding) AS semantic_rank
      FROM "TextChunk" c
      JOIN "Document" d ON d.id = c."documentId"
      CROSS JOIN q
      WHERE d."indexStatus" = 'indexed'
        AND ($3::int IS NULL OR d.year = $3::int)
        AND (
          c.tsv @@ q.tsq
          OR (1 - (c.embedding <=> q.embedding)) > 0.14
        )
    )
    SELECT *
    FROM ranked
    ORDER BY ((COALESCE(keyword_rank, 0) * 0.62) + (COALESCE(semantic_rank, 0) * 0.38)) DESC
    LIMIT 50
  `, cleanQuery, embedding, yearFilter);

  return rows.map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    title: row.title,
    year: row.year,
    page: row.page,
    excerpt: makeExcerpt(row.content, cleanQuery),
    score: combineRank(row.keyword_rank ?? 0, row.semantic_rank ?? 0)
  }));
}
