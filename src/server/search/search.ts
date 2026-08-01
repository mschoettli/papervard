import "server-only";

import { prisma } from "@/lib/prisma";
import { embedText, vectorLiteral } from "@/server/search/embeddings";
import { combineRank, makeExcerpt } from "@/server/search/ranking";
import { householdIdsForUser, type DocumentScope } from "@/server/documents/access";

type RawSearchRow = {
  chunk_id: string;
  document_id: string;
  title: string;
  year: number;
  page: number;
  content: string;
  keyword_rank: number | null;
  semantic_rank: number | null;
  total: bigint | number;
};

export type SearchFilters = {
  year?: number;
  scope?: DocumentScope;
  documentId?: string;
  limit?: number;
  offset?: number;
  folderIds?: string[];
  tagIds?: string[];
  isAdmin?: boolean;
};

export async function hybridSearch(userId: string, query: string, filters: SearchFilters = {}) {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return { results: [], total: 0 };

  const householdIds = await householdIdsForUser(userId);
  const embedding = vectorLiteral(embedText(cleanQuery));
  const year = filters.year && Number.isInteger(filters.year) ? filters.year : null;
  const scope = filters.scope ?? "all";
  const documentId = filters.documentId ?? null;
  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);
  const folderIds = [...new Set(filters.folderIds ?? [])];
  const tagIds = [...new Set(filters.tagIds ?? [])];
  const isAdmin = filters.isAdmin ?? false;

  const rows = await prisma.$queryRawUnsafe<RawSearchRow[]>(`
    WITH q AS (
      SELECT
        websearch_to_tsquery('simple', $1) AS tsq,
        $2::vector AS embedding
    ),
    ranked AS (
      SELECT
        COALESCE(c.id, d.id) AS chunk_id,
        d.id AS document_id,
        d.title,
        d.year,
        COALESCE(c.page, 1) AS page,
        COALESCE(c.content, '') AS content,
        ts_rank_cd(
          setweight(to_tsvector('simple', COALESCE(d.title, '') || ' ' || COALESCE(d."originalName", '')), 'A')
          || COALESCE(c.tsv, ''::tsvector),
          q.tsq
        ) AS keyword_rank,
        COALESCE(1 - (c.embedding <=> q.embedding), 0) AS semantic_rank
      FROM "Document" d
      LEFT JOIN "TextChunk" c ON d.id = c."documentId"
      CROSS JOIN q
      WHERE d."indexStatus" = 'indexed'::"IndexStatus"
        AND d."deletedAt" IS NULL
        AND ($3::int IS NULL OR d.year = $3::int)
        AND ($7::text IS NULL OR d.id = $7::text)
        AND (cardinality($10::text[]) = 0 OR d."folderId" = ANY($10::text[]))
        AND (
          cardinality($11::text[]) = 0
          OR (
            SELECT COUNT(DISTINCT document_tag."tagId")
            FROM "DocumentTag" document_tag
            WHERE document_tag."documentId" = d.id
              AND document_tag."tagId" = ANY($11::text[])
          ) = cardinality($11::text[])
        )
        AND (
          d."ownerUserId" = $4::text
          OR ($12::boolean AND d."householdId" = ANY($5::text[]))
          OR (d."visibility" = 'family'::"DocumentVisibility" AND d."householdId" = ANY($5::text[]))
        )
        AND (
          $6::text = 'all'
          OR ($6::text = 'mine' AND d."ownerUserId" = $4::text)
          OR ($6::text = 'family' AND d."visibility" = 'family'::"DocumentVisibility" AND d."householdId" = ANY($5::text[]))
          OR ($6::text = 'favorites' AND EXISTS (
            SELECT 1 FROM "FavoriteDocument" favorite
            WHERE favorite."documentId" = d.id AND favorite."userId" = $4::text
          ))
        )
        AND (
          (setweight(to_tsvector('simple', COALESCE(d.title, '') || ' ' || COALESCE(d."originalName", '')), 'A')
            || COALESCE(c.tsv, ''::tsvector)) @@ q.tsq
          OR (c.embedding IS NOT NULL AND (1 - (c.embedding <=> q.embedding)) > 0.14)
        )
    ),
    best_per_document AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY document_id
        ORDER BY ((COALESCE(keyword_rank, 0) * 0.62) + (COALESCE(semantic_rank, 0) * 0.38)) DESC
      ) AS result_number
      FROM ranked
    )
    SELECT *, COUNT(*) OVER() AS total
    FROM best_per_document
    WHERE result_number = 1
    ORDER BY ((COALESCE(keyword_rank, 0) * 0.62) + (COALESCE(semantic_rank, 0) * 0.38)) DESC
    LIMIT $8::int OFFSET $9::int
  `, cleanQuery, embedding, year, userId, householdIds, scope, documentId, limit, offset, folderIds, tagIds, isAdmin);

  return {
    results: rows.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      title: row.title,
      year: row.year,
      page: row.page,
      excerpt: makeExcerpt(row.content, cleanQuery),
      score: combineRank(row.keyword_rank ?? 0, row.semantic_rank ?? 0)
    })),
    total: rows.length > 0 ? Number(rows[0].total) : 0
  };
}
