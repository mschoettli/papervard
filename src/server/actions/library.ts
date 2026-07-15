"use server";

import { unlink } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth";
import {
  ensureUnsortedFolder,
  folderAccessWhere,
  moveWouldCreateCycle,
  TRASH_RETENTION_DAYS
} from "@/server/documents/folders";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";
import { normalizeTagColor, normalizeTagName } from "@/server/documents/tags";
import { thumbnailPath } from "@/server/pdf/thumbnail";

const idSchema = z.string().trim().min(1).max(200);
const optionalIdSchema = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  idSchema.optional()
);
const folderNameSchema = z.string().transform((value) => value.trim().replace(/\s+/g, " ")).pipe(z.string().min(1).max(80));
const visibilitySchema = z.enum(["private", "family"]);

async function userContext() {
  const user = await requireUser();
  const householdIds = await householdIdsForUser(user.id);
  if (householdIds.length === 0) throw new Error("Für diesen Benutzer ist keine Familie eingerichtet.");
  return { user, householdIds, householdId: householdIds[0] };
}

function revalidateLibrary(documentId?: string) {
  revalidatePath("/documents");
  if (documentId) revalidatePath(`/documents/${documentId}`);
}

export async function createFolderAction(formData: FormData) {
  const { user, householdIds, householdId } = await userContext();
  const parsed = z.object({
    name: folderNameSchema,
    visibility: visibilitySchema,
    parentId: optionalIdSchema
  }).parse({
    name: formData.get("name"),
    visibility: formData.get("visibility"),
    parentId: formData.get("parentId")
  });

  let parent = null;
  if (parsed.parentId) {
    parent = await prisma.folder.findFirst({
      where: { id: parsed.parentId, ...folderAccessWhere(user.id, householdIds) }
    });
    if (!parent || parent.visibility !== parsed.visibility) {
      throw new Error("Der übergeordnete Ordner passt nicht zur gewählten Sichtbarkeit.");
    }
  }

  const duplicate = await prisma.folder.findFirst({
    where: {
      parentId: parsed.parentId ?? null,
      deletedAt: null,
      name: { equals: parsed.name, mode: "insensitive" },
      visibility: parsed.visibility,
      ...(parsed.visibility === "private"
        ? { createdByUserId: user.id }
        : { householdId: parent?.householdId ?? householdId })
    },
    select: { id: true }
  });
  if (duplicate) throw new Error("In diesem Bereich gibt es bereits einen Ordner mit diesem Namen.");

  await prisma.folder.create({
    data: {
      name: parsed.name,
      visibility: parsed.visibility,
      createdByUserId: user.id,
      householdId: parent?.householdId ?? householdId,
      parentId: parsed.parentId
    }
  });
  revalidateLibrary();
}

export async function renameFolderAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const parsed = z.object({ id: idSchema, name: folderNameSchema }).parse({
    id: formData.get("folderId"),
    name: formData.get("name")
  });
  const folder = await prisma.folder.findFirst({
    where: { id: parsed.id, ...folderAccessWhere(user.id, householdIds) }
  });
  if (!folder) throw new Error("Ordner nicht gefunden.");
  if (folder.isSystem) throw new Error("Der Systemordner „Unsortiert“ kann nicht umbenannt werden.");

  const duplicate = await prisma.folder.findFirst({
    where: {
      id: { not: folder.id },
      parentId: folder.parentId,
      deletedAt: null,
      name: { equals: parsed.name, mode: "insensitive" },
      visibility: folder.visibility,
      ...(folder.visibility === "private"
        ? { createdByUserId: user.id }
        : { householdId: folder.householdId })
    },
    select: { id: true }
  });
  if (duplicate) throw new Error("In diesem Bereich gibt es bereits einen Ordner mit diesem Namen.");
  await prisma.folder.update({ where: { id: folder.id }, data: { name: parsed.name } });
  revalidateLibrary();
}

export async function moveFolderAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const parsed = z.object({ folderId: idSchema, targetFolderId: optionalIdSchema }).parse({
    folderId: formData.get("folderId"),
    targetFolderId: formData.get("targetFolderId")
  });
  const folder = await prisma.folder.findFirst({
    where: { id: parsed.folderId, ...folderAccessWhere(user.id, householdIds) }
  });
  if (!folder) throw new Error("Ordner nicht gefunden.");
  if (folder.isSystem) throw new Error("Der Systemordner „Unsortiert“ kann nicht verschoben werden.");

  const target = parsed.targetFolderId
    ? await prisma.folder.findFirst({
        where: { id: parsed.targetFolderId, ...folderAccessWhere(user.id, householdIds) }
      })
    : null;
  if (parsed.targetFolderId && !target) throw new Error("Zielordner nicht gefunden.");
  if (target && (target.visibility !== folder.visibility || target.householdId !== folder.householdId)) {
    throw new Error("Ordner können nicht zwischen privaten und gemeinsamen Bereichen verschoben werden.");
  }

  const peers = await prisma.folder.findMany({
    where: folderAccessWhere(user.id, householdIds),
    select: { id: true, parentId: true }
  });
  if (moveWouldCreateCycle(peers, folder.id, target?.id ?? null)) {
    throw new Error("Ein Ordner kann nicht in sich selbst oder einen Unterordner verschoben werden.");
  }

  await prisma.folder.update({ where: { id: folder.id }, data: { parentId: target?.id ?? null } });
  revalidateLibrary();
}

export async function trashFolderAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const folderId = idSchema.parse(formData.get("folderId"));
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, ...folderAccessWhere(user.id, householdIds) }
  });
  if (!folder) throw new Error("Ordner nicht gefunden.");
  if (folder.isSystem) throw new Error("Der Systemordner „Unsortiert“ kann nicht gelöscht werden.");
  const unsorted = await ensureUnsortedFolder({
    userId: folder.visibility === "private" ? folder.createdByUserId : user.id,
    householdId: folder.householdId,
    visibility: folder.visibility
  });
  const deletedAt = new Date();

  await prisma.$transaction([
    prisma.document.updateMany({
      where: { folderId: folder.id },
      data: { folderId: unsorted.id }
    }),
    prisma.folder.updateMany({
      where: { parentId: folder.id },
      data: { parentId: unsorted.id }
    }),
    prisma.folder.update({
      where: { id: folder.id },
      data: { deletedAt, deletedFromParentId: folder.parentId }
    })
  ]);
  revalidateLibrary();
}

const tagInputSchema = z.object({
  name: z.string().transform(normalizeTagName).pipe(z.string().min(1).max(60)),
  color: z.string().transform(normalizeTagColor)
});

export async function createTagAction(formData: FormData) {
  const { user, householdId } = await userContext();
  const parsed = tagInputSchema.parse({ name: formData.get("name"), color: formData.get("color") ?? "" });
  const duplicate = await prisma.tag.findFirst({
    where: { householdId, name: { equals: parsed.name, mode: "insensitive" } },
    select: { id: true }
  });
  if (duplicate) throw new Error("Dieses Tag existiert bereits.");
  await prisma.tag.create({ data: { ...parsed, householdId, createdByUserId: user.id } });
  revalidateLibrary();
}

export async function updateTagAction(formData: FormData) {
  const { householdIds } = await userContext();
  const tagId = idSchema.parse(formData.get("tagId"));
  const parsed = tagInputSchema.parse({ name: formData.get("name"), color: formData.get("color") ?? "" });
  const tag = await prisma.tag.findFirst({ where: { id: tagId, householdId: { in: householdIds } } });
  if (!tag) throw new Error("Tag nicht gefunden.");
  const duplicate = await prisma.tag.findFirst({
    where: { id: { not: tag.id }, householdId: tag.householdId, name: { equals: parsed.name, mode: "insensitive" } },
    select: { id: true }
  });
  if (duplicate) throw new Error("Dieses Tag existiert bereits.");
  await prisma.tag.update({ where: { id: tag.id }, data: parsed });
  revalidateLibrary();
}

export async function mergeTagAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const parsed = z.object({ sourceTagId: idSchema, targetTagId: idSchema }).parse({
    sourceTagId: formData.get("sourceTagId"),
    targetTagId: formData.get("targetTagId")
  });
  if (parsed.sourceTagId === parsed.targetTagId) throw new Error("Bitte zwei unterschiedliche Tags wählen.");
  const tags = await prisma.tag.findMany({
    where: { id: { in: [parsed.sourceTagId, parsed.targetTagId] }, householdId: { in: householdIds } },
    select: { id: true, householdId: true }
  });
  if (tags.length !== 2 || tags[0].householdId !== tags[1].householdId) throw new Error("Tags können nicht zusammengeführt werden.");
  const assignments = await prisma.documentTag.findMany({
    where: { tagId: parsed.sourceTagId },
    select: { documentId: true }
  });
  await prisma.$transaction([
    prisma.documentTag.createMany({
      data: assignments.map(({ documentId }) => ({ documentId, tagId: parsed.targetTagId, assignedByUserId: user.id })),
      skipDuplicates: true
    }),
    prisma.tag.delete({ where: { id: parsed.sourceTagId } })
  ]);
  revalidateLibrary();
}

export async function deleteTagAction(formData: FormData) {
  const { householdIds } = await userContext();
  const tagId = idSchema.parse(formData.get("tagId"));
  const tag = await prisma.tag.findFirst({ where: { id: tagId, householdId: { in: householdIds } }, select: { id: true } });
  if (!tag) throw new Error("Tag nicht gefunden.");
  await prisma.tag.delete({ where: { id: tag.id } });
  revalidateLibrary();
}

export async function updateDocumentTagsAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const documentId = idSchema.parse(formData.get("documentId"));
  const tagIds = [...new Set(formData.getAll("tagId").map(String).filter(Boolean))];
  const document = await prisma.document.findFirst({
    where: { id: documentId, ...documentAccessWhere(user.id, householdIds) },
    select: { id: true, householdId: true }
  });
  if (!document) throw new Error("Dokument nicht gefunden.");
  const tags = tagIds.length
    ? await prisma.tag.findMany({ where: { id: { in: tagIds }, householdId: document.householdId }, select: { id: true } })
    : [];
  if (tags.length !== tagIds.length) throw new Error("Mindestens ein Tag ist nicht verfügbar.");
  await prisma.$transaction([
    prisma.documentTag.deleteMany({ where: { documentId: document.id } }),
    prisma.documentTag.createMany({
      data: tags.map((tag) => ({ documentId: document.id, tagId: tag.id, assignedByUserId: user.id }))
    })
  ]);
  revalidateLibrary(document.id);
}

function trashedFolderAccess(userId: string, householdIds: string[]) {
  return {
    deletedAt: { not: null },
    OR: [
      { visibility: "private" as const, createdByUserId: userId },
      { visibility: "family" as const, householdId: { in: householdIds } }
    ]
  };
}

function trashedDocumentAccess(userId: string, householdIds: string[]) {
  return {
    deletedAt: { not: null },
    OR: [
      { ownerUserId: userId },
      { visibility: "family" as const, householdId: { in: householdIds } }
    ]
  };
}

export async function restoreTrashItemAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const parsed = z.object({ type: z.enum(["document", "folder"]), id: idSchema }).parse({
    type: formData.get("type"),
    id: formData.get("id")
  });

  if (parsed.type === "folder") {
    const folder = await prisma.folder.findFirst({ where: { id: parsed.id, ...trashedFolderAccess(user.id, householdIds) } });
    if (!folder) throw new Error("Ordner im Papierkorb nicht gefunden.");
    const formerParent = folder.deletedFromParentId
      ? await prisma.folder.findFirst({ where: { id: folder.deletedFromParentId, ...folderAccessWhere(user.id, householdIds), visibility: folder.visibility } })
      : null;
    const fallback = folder.deletedFromParentId && !formerParent
      ? await ensureUnsortedFolder({
          userId: folder.visibility === "private" ? folder.createdByUserId : user.id,
          householdId: folder.householdId,
          visibility: folder.visibility
        })
      : null;
    await prisma.folder.update({
      where: { id: folder.id },
      data: { deletedAt: null, deletedFromParentId: null, parentId: formerParent?.id ?? fallback?.id ?? null }
    });
  } else {
    const document = await prisma.document.findFirst({ where: { id: parsed.id, ...trashedDocumentAccess(user.id, householdIds) } });
    if (!document) throw new Error("Dokument im Papierkorb nicht gefunden.");
    const formerFolder = document.deletedFromFolderId
      ? await prisma.folder.findFirst({ where: { id: document.deletedFromFolderId, ...folderAccessWhere(user.id, householdIds), visibility: document.visibility } })
      : null;
    const fallback = formerFolder ?? await ensureUnsortedFolder({
      userId: document.ownerUserId,
      householdId: document.householdId,
      visibility: document.visibility
    });
    await prisma.document.update({
      where: { id: document.id },
      data: { deletedAt: null, deletedFromFolderId: null, folderId: fallback.id }
    });
  }
  revalidateLibrary();
}

async function permanentlyDeleteDocument(id: string, storagePath: string) {
  await prisma.document.delete({ where: { id } });
  await Promise.all([
    unlink(storagePath).catch(() => undefined),
    unlink(thumbnailPath(id)).catch(() => undefined)
  ]);
}

export async function permanentlyDeleteTrashItemAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const parsed = z.object({ type: z.enum(["document", "folder"]), id: idSchema }).parse({
    type: formData.get("type"),
    id: formData.get("id")
  });
  if (parsed.type === "document") {
    const document = await prisma.document.findFirst({
      where: { id: parsed.id, ...trashedDocumentAccess(user.id, householdIds) },
      select: { id: true, storagePath: true }
    });
    if (!document) throw new Error("Dokument im Papierkorb nicht gefunden.");
    await permanentlyDeleteDocument(document.id, document.storagePath);
  } else {
    const folder = await prisma.folder.findFirst({
      where: { id: parsed.id, ...trashedFolderAccess(user.id, householdIds), isSystem: false },
      select: { id: true }
    });
    if (!folder) throw new Error("Ordner im Papierkorb nicht gefunden.");
    await prisma.folder.delete({ where: { id: folder.id } });
  }
  revalidateLibrary();
}

export async function emptyTrashAction() {
  const { user, householdIds } = await userContext();
  const documents = await prisma.document.findMany({
    where: trashedDocumentAccess(user.id, householdIds),
    select: { id: true, storagePath: true }
  });
  for (const document of documents) await permanentlyDeleteDocument(document.id, document.storagePath);
  await prisma.folder.deleteMany({ where: { ...trashedFolderAccess(user.id, householdIds), isSystem: false } });
  revalidateLibrary();
}

export async function purgeExpiredTrash() {
  await requireUser();
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const documents = await prisma.document.findMany({
    where: { deletedAt: { lte: cutoff } },
    select: { id: true, storagePath: true }
  });
  for (const document of documents) await permanentlyDeleteDocument(document.id, document.storagePath);
  await prisma.folder.deleteMany({ where: { deletedAt: { lte: cutoff }, isSystem: false } });
}
