import { z } from "zod";
import type { Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { householdIdsForUser } from "@/server/documents/access";
import { collectDescendantFolderIds, folderAccessWhere } from "@/server/documents/folders";
import { hybridSearch } from "@/server/search/search";

const uniqueStrings = (values: string[]) => [...new Set(values)];

const explicitSelectionSchema = z.object({
  mode: z.literal("explicit"),
  ids: z.array(z.string().min(1)).min(1).max(500)
});

const querySelectionSchema = z.object({
  mode: z.literal("query"),
  query: z.string().trim().max(500).optional(),
  folderId: z.string().min(1).optional(),
  scope: z.enum(["all", "mine", "family", "favorites"]).default("all"),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
  tagIds: z.array(z.string().min(1)).max(100).default([]),
  excludeIds: z.array(z.string().min(1)).max(500).default([])
});

export type DocumentSelection =
  | { mode: "explicit"; ids: string[] }
  | {
      mode: "query";
      query?: string;
      folderId?: string;
      scope: "all" | "mine" | "family" | "favorites";
      year?: number;
      tagIds: string[];
      excludeIds: string[];
    };

export function normalizeDocumentSelection(input: unknown): DocumentSelection {
  const mode = z.object({ mode: z.enum(["explicit", "query"]) }).parse(input).mode;
  if (mode === "explicit") {
    const parsed = explicitSelectionSchema.parse(input);
    return { mode: "explicit", ids: uniqueStrings(parsed.ids) };
  }
  const parsed = querySelectionSchema.parse(input);
  return {
    mode: "query",
    ...(parsed.query ? { query: parsed.query } : {}),
    ...(parsed.folderId ? { folderId: parsed.folderId } : {}),
    scope: parsed.scope,
    ...(parsed.year ? { year: parsed.year } : {}),
    tagIds: uniqueStrings(parsed.tagIds),
    excludeIds: uniqueStrings(parsed.excludeIds)
  };
}

export function buildDocumentSelectionWhere(
  selection: DocumentSelection,
  context: { userId: string; householdIds: string[]; isAdmin: boolean },
  recursiveFolderIds: string[] = []
): Prisma.DocumentWhereInput {
  const access: Prisma.DocumentWhereInput = {
    AND: [
      { deletedAt: null },
      {
        OR: [
          { ownerUserId: context.userId },
          context.isAdmin
            ? { householdId: { in: context.householdIds } }
            : { visibility: "family", householdId: { in: context.householdIds } }
        ]
      }
    ]
  };
  if (selection.mode === "explicit") {
    return { AND: [access, { id: { in: selection.ids } }] };
  }

  const scope: Prisma.DocumentWhereInput = selection.scope === "mine"
    ? { ownerUserId: context.userId }
    : selection.scope === "family"
      ? { visibility: "family", householdId: { in: context.householdIds } }
      : selection.scope === "favorites"
        ? { favorites: { some: { userId: context.userId } } }
        : {};

  return {
    AND: [
      access,
      scope,
      selection.year ? { year: selection.year } : {},
      selection.folderId ? { folderId: { in: recursiveFolderIds } } : {},
      selection.excludeIds.length ? { id: { notIn: selection.excludeIds } } : {},
      ...selection.tagIds.map((tagId) => ({ tags: { some: { tagId } } }))
    ]
  };
}

export const selectedDocumentFields = {
  id: true,
  title: true,
  originalName: true,
  year: true,
  size: true,
  storagePath: true,
  currentVersionId: true,
  visibility: true,
  householdId: true,
  ownerUserId: true,
  folderId: true,
  currentVersion: { select: { blob: { select: { storagePath: true, size: true } } } }
} satisfies Prisma.DocumentSelect;

export async function resolveDocumentSelection(user: Pick<User, "id" | "role">, input: unknown) {
  const selection = normalizeDocumentSelection(input);
  const householdIds = await householdIdsForUser(user.id);
  const context = { userId: user.id, householdIds, isAdmin: user.role === "admin" };
  let recursiveFolderIds: string[] = [];

  if (selection.mode === "query" && selection.folderId) {
    const folders = await prisma.folder.findMany({
      where: folderAccessWhere(user.id, householdIds, context.isAdmin),
      select: { id: true, parentId: true }
    });
    if (folders.some((folder) => folder.id === selection.folderId)) {
      recursiveFolderIds = collectDescendantFolderIds(folders, selection.folderId);
    }
  }

  const where = buildDocumentSelectionWhere(selection, context, recursiveFolderIds);
  if (selection.mode === "query" && selection.query !== undefined) {
    if (selection.query.length < 2) return [];
    const ids: string[] = [];
    let offset = 0;
    let total = 0;
    do {
      const page = await hybridSearch(user.id, selection.query, {
        isAdmin: context.isAdmin,
        year: selection.year,
        scope: selection.scope,
        folderIds: selection.folderId ? recursiveFolderIds : [],
        tagIds: selection.tagIds,
        limit: 500,
        offset
      });
      total = page.total;
      ids.push(...page.results.map((result) => result.documentId));
      offset += page.results.length;
      if (page.results.length === 0) break;
    } while (offset < total);

    return prisma.document.findMany({
      where: { AND: [where, { id: { in: ids } }] },
      select: selectedDocumentFields,
      orderBy: { id: "asc" }
    });
  }

  return prisma.document.findMany({ where, select: selectedDocumentFields, orderBy: { id: "asc" } });
}
