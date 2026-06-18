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

export type SearchMode = "hybrid" | "keyword" | "semantic";

export type SearchFilters = {
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  title?: string;
  status?: "queued" | "processing" | "indexed" | "failed";
  mode?: SearchMode;
};

export async function hybridSearch(query: string, filters: number | SearchFilters = {}) {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];

  const normalizedFilters = typeof filters === "number" ? { year: filters } : filters;
  const embedding = vectorLiteral(embedText(cleanQuery));
  const yearFilter = normalizedFilters.year && Number.isInteger(normalizedFilters.year) ? normalizedFilters.year : null;
  const yearFrom = normalizedFilters.yearFrom && Number.isInteger(normalizedFilters.yearFrom) ? normalizedFilters.yearFrom : null;
  const yearTo = normalizedFilters.yearTo && Number.isInteger(normalizedFilters.yearTo) ? normalizedFilters.yearTo : null;
  const titleFilter = normalizedFilters.title?.trim() ? `%${normalizedFilters.title.trim()}%` : null;
  const statusFilter = normalizedFilters.status ?? "indexed";
  const mode = normalizedFilters.mode ?? "hybrid";
  const allowKeyword = mode === "hybrid" || mode === "keyword";
  const allowSemantic = mode === "hybrid" || mode === "semantic";

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
      WHERE d."indexStatus" = $4::"IndexStatus"
        AND ($3::int IS NULL OR d.year = $3::int)
        AND ($5::int IS NULL OR d.year >= $5::int)
        AND ($6::int IS NULL OR d.year <= $6::int)
        AND ($7::text IS NULL OR d.title ILIKE $7::text)
        AND (
          ($8::boolean AND c.tsv @@ q.tsq)
          OR ($9::boolean AND (1 - (c.embedding <=> q.embedding)) > 0.14)
        )
    )
    SELECT *
    FROM ranked
    ORDER BY ((COALESCE(keyword_rank, 0) * 0.62) + (COALESCE(semantic_rank, 0) * 0.38)) DESC
    LIMIT 50
  `, cleanQuery, embedding, yearFilter, statusFilter, yearFrom, yearTo, titleFilter, allowKeyword, allowSemantic);

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
