import "server-only";

import type { DocumentVisibility, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type FolderNode = { id: string; parentId: string | null };

export const TRASH_RETENTION_DAYS = 30;

export function collectDescendantFolderIds(folders: FolderNode[], rootId: string) {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder.id]);
  }

  const result: string[] = [];
  const pending = [rootId];
  const seen = new Set<string>();
  while (pending.length) {
    const id = pending.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    pending.push(...(children.get(id) ?? []));
  }
  return result;
}

export function moveWouldCreateCycle(folders: FolderNode[], folderId: string, targetParentId: string | null) {
  if (!targetParentId) return false;
  return collectDescendantFolderIds(folders, folderId).includes(targetParentId);
}

export function trashExpiresAt(deletedAt: Date) {
  return new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export function folderAccessWhere(userId: string, householdIds: string[]): Prisma.FolderWhereInput {
  return {
    AND: [
      { deletedAt: null },
      {
        OR: [
          { visibility: "private", createdByUserId: userId },
          { visibility: "family", householdId: { in: householdIds } }
        ]
      }
    ]
  };
}

export async function ensureUnsortedFolder(options: {
  userId: string;
  householdId: string;
  visibility: DocumentVisibility;
}) {
  const isPrivate = options.visibility === "private";
  const id = isPrivate
    ? `unsorted-private-${options.userId}`
    : `unsorted-family-${options.householdId}`;

  return prisma.folder.upsert({
    where: { id },
    update: { deletedAt: null, deletedFromParentId: null },
    create: {
      id,
      name: "Unsortiert",
      isSystem: true,
      visibility: options.visibility,
      createdByUserId: options.userId,
      householdId: options.householdId,
      parentId: null
    }
  });
}

export async function resolveUploadFolder(options: {
  requestedFolderId?: string;
  userId: string;
  householdId: string;
  visibility: DocumentVisibility;
}) {
  if (!options.requestedFolderId) return ensureUnsortedFolder(options);

  const folder = await prisma.folder.findFirst({
    where: {
      id: options.requestedFolderId,
      deletedAt: null,
      visibility: options.visibility,
      ...(options.visibility === "private"
        ? { createdByUserId: options.userId }
        : { householdId: options.householdId })
    }
  });
  if (!folder) throw new Error("Der gewählte Zielordner ist nicht verfügbar.");
  return folder;
}

export async function accessibleFolderIds(userId: string, householdIds: string[], rootId?: string) {
  const folders = await prisma.folder.findMany({
    where: folderAccessWhere(userId, householdIds),
    select: { id: true, parentId: true }
  });
  return rootId ? collectDescendantFolderIds(folders, rootId) : folders.map((folder) => folder.id);
}
