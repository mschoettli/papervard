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
  reorderSiblingFolderIds,
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
const folderIconSchema = z.preprocess(
  (value) => typeof value === "string" && value ? value : "folder",
  z.enum(["folder", "archive", "briefcase", "heart", "home", "receipt", "shield", "star"])
);
const optionalFolderIconSchema = z.preprocess(
  (value) => typeof value === "string" && value ? value : undefined,
  folderIconSchema.optional()
);

async function userContext() {
  const user = await requireUser();
  const householdIds = await householdIdsForUser(user.id);
  if (householdIds.length === 0) throw new Error("Für diesen Benutzer ist keine Familie eingerichtet.");
  return { user, householdIds, householdId: householdIds[0] };
}

function revalidateLibrary(documentId?: string) {
  revalidatePath("/folders");
  revalidatePath("/documents");
  if (documentId) revalidatePath(`/documents/${documentId}`);
}

export async function createFolderAction(formData: FormData) {
  const { user, householdIds, householdId } = await userContext();
  const parsed = z.object({
    name: folderNameSchema,
    icon: folderIconSchema,
    visibility: visibilitySchema,
    parentId: optionalIdSchema
  }).parse({
    name: formData.get("name"),
    icon: formData.get("icon"),
    visibility: formData.get("visibility"),
    parentId: formData.get("parentId")
  });

  let parent = null;
  if (parsed.parentId) {
    parent = await prisma.folder.findFirst({
      where: { id: parsed.parentId, ...folderAccessWhere(user.id, householdIds, user.role === "admin") }
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

  const lastSibling = await prisma.folder.findFirst({
    where: {
      parentId: parsed.parentId ?? null,
      deletedAt: null,
      visibility: parsed.visibility,
      ...(parsed.visibility === "private"
        ? { createdByUserId: user.id }
        : { householdId: parent?.householdId ?? householdId })
    },
    orderBy: { position: "desc" },
    select: { position: true }
  });

  await prisma.folder.create({
    data: {
      name: parsed.name,
      icon: parsed.icon,
      visibility: parsed.visibility,
      createdByUserId: user.id,
      householdId: parent?.householdId ?? householdId,
      parentId: parsed.parentId,
      position: (lastSibling?.position ?? -1) + 1
    }
  });
  revalidateLibrary();
}

export async function renameFolderAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const parsed = z.object({ id: idSchema, name: folderNameSchema, icon: optionalFolderIconSchema }).parse({
    id: formData.get("folderId"),
    name: formData.get("name"),
    icon: formData.get("icon")
  });
  const folder = await prisma.folder.findFirst({
    where: { id: parsed.id, ...folderAccessWhere(user.id, householdIds, user.role === "admin") }
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
  await prisma.folder.update({
    where: { id: folder.id },
    data: { name: parsed.name, ...(parsed.icon ? { icon: parsed.icon } : {}) }
  });
  revalidateLibrary();
}

async function repositionFolder(
  context: Awaited<ReturnType<typeof userContext>>,
  folderId: string,
  targetParentId?: string,
  beforeFolderId?: string
) {
  const { user, householdIds } = context;
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, ...folderAccessWhere(user.id, householdIds, user.role === "admin") }
  });
  if (!folder) throw new Error("Ordner nicht gefunden.");
  if (folder.isSystem) throw new Error("Der Systemordner „Unsortiert“ kann nicht verschoben werden.");

  const target = targetParentId
    ? await prisma.folder.findFirst({
        where: { id: targetParentId, ...folderAccessWhere(user.id, householdIds, user.role === "admin") }
      })
    : null;
  if (targetParentId && !target) throw new Error("Zielordner nicht gefunden.");
  if (target && (target.visibility !== folder.visibility || target.householdId !== folder.householdId)) {
    throw new Error("Ordner können nicht zwischen privaten und gemeinsamen Bereichen verschoben werden.");
  }

  const peers = await prisma.folder.findMany({
    where: folderAccessWhere(user.id, householdIds, user.role === "admin"),
    select: { id: true, parentId: true }
  });
  if (moveWouldCreateCycle(peers, folder.id, target?.id ?? null)) {
    throw new Error("Ein Ordner kann nicht in sich selbst oder einen Unterordner verschoben werden.");
  }

  const siblingWhere = (parentId: string | null) => ({
    parentId,
    deletedAt: null,
    isSystem: false,
    visibility: folder.visibility,
    ...(folder.visibility === "private"
      ? { createdByUserId: folder.createdByUserId }
      : { householdId: folder.householdId })
  });
  const targetParentIdValue = target?.id ?? null;
  const [sourceSiblings, targetSiblings] = await Promise.all([
    prisma.folder.findMany({
      where: siblingWhere(folder.parentId),
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true }
    }),
    folder.parentId === targetParentIdValue
      ? Promise.resolve([])
      : prisma.folder.findMany({
          where: siblingWhere(targetParentIdValue),
          orderBy: [{ position: "asc" }, { name: "asc" }],
          select: { id: true }
        })
  ]);
  const destination = folder.parentId === targetParentIdValue ? sourceSiblings : targetSiblings;
  if (beforeFolderId && beforeFolderId !== folder.id && !destination.some(({ id }) => id === beforeFolderId)) {
    throw new Error("Die gewählte Einfügeposition ist nicht verfügbar.");
  }
  const destinationIds = reorderSiblingFolderIds(
    destination.map(({ id }) => id),
    folder.id,
    beforeFolderId === folder.id ? undefined : beforeFolderId
  );
  const sourceIds = folder.parentId === targetParentIdValue
    ? []
    : sourceSiblings.map(({ id }) => id).filter((id) => id !== folder.id);

  await prisma.$transaction([
    prisma.folder.update({
      where: { id: folder.id },
      data: { parentId: targetParentIdValue }
    }),
    ...sourceIds.map((id, position) => prisma.folder.update({ where: { id }, data: { position } })),
    ...destinationIds.map((id, position) => prisma.folder.update({ where: { id }, data: { position } }))
  ]);
  revalidateLibrary();
}

export async function moveFolderAction(formData: FormData) {
  const context = await userContext();
  const parsed = z.object({ folderId: idSchema, targetFolderId: optionalIdSchema }).parse({
    folderId: formData.get("folderId"),
    targetFolderId: formData.get("targetFolderId")
  });
  await repositionFolder(context, parsed.folderId, parsed.targetFolderId);
}

export async function reorderFolderAction(formData: FormData) {
  const context = await userContext();
  const parsed = z.object({
    folderId: idSchema,
    targetParentId: optionalIdSchema,
    beforeFolderId: optionalIdSchema
  }).parse({
    folderId: formData.get("folderId"),
    targetParentId: formData.get("targetParentId"),
    beforeFolderId: formData.get("beforeFolderId")
  });
  await repositionFolder(context, parsed.folderId, parsed.targetParentId, parsed.beforeFolderId);
}

export async function trashFolderAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const folderId = idSchema.parse(formData.get("folderId"));
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, ...folderAccessWhere(user.id, householdIds, user.role === "admin") }
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
  const [documentAssignments, folderAssignments, collectionAssignments, dicomSeriesAssignments] = await Promise.all([
    prisma.documentTag.findMany({ where: { tagId: parsed.sourceTagId }, select: { documentId: true } }),
    prisma.folderTag.findMany({ where: { tagId: parsed.sourceTagId }, select: { folderId: true } }),
    prisma.collectionTag.findMany({ where: { tagId: parsed.sourceTagId }, select: { collectionId: true } }),
    prisma.dicomSeriesTag.findMany({ where: { tagId: parsed.sourceTagId }, select: { dicomSeriesId: true } })
  ]);
  await prisma.$transaction([
    prisma.documentTag.createMany({
      data: documentAssignments.map(({ documentId }) => ({ documentId, tagId: parsed.targetTagId, assignedByUserId: user.id })),
      skipDuplicates: true
    }),
    prisma.folderTag.createMany({
      data: folderAssignments.map(({ folderId }) => ({ folderId, tagId: parsed.targetTagId, assignedByUserId: user.id })),
      skipDuplicates: true
    }),
    prisma.collectionTag.createMany({
      data: collectionAssignments.map(({ collectionId }) => ({ collectionId, tagId: parsed.targetTagId, assignedByUserId: user.id })),
      skipDuplicates: true
    }),
    prisma.dicomSeriesTag.createMany({
      data: dicomSeriesAssignments.map(({ dicomSeriesId }) => ({ dicomSeriesId, tagId: parsed.targetTagId, assignedByUserId: user.id })),
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
    where: { id: documentId, ...documentAccessWhere(user.id, householdIds, user.role === "admin") },
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

async function selectedHouseholdTags(formData: FormData, householdId: string) {
  const tagIds = [...new Set(formData.getAll("tagId").map(String).filter(Boolean))];
  const tags = tagIds.length
    ? await prisma.tag.findMany({ where: { id: { in: tagIds }, householdId }, select: { id: true } })
    : [];
  if (tags.length !== tagIds.length) throw new Error("Mindestens ein Tag ist nicht verfügbar.");
  return tags;
}

export async function updateFolderTagsAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const folderId = idSchema.parse(formData.get("folderId"));
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, ...folderAccessWhere(user.id, householdIds, user.role === "admin") },
    select: { id: true, householdId: true }
  });
  if (!folder) throw new Error("Ordner nicht gefunden.");
  const tags = await selectedHouseholdTags(formData, folder.householdId);
  await prisma.$transaction([
    prisma.folderTag.deleteMany({ where: { folderId: folder.id } }),
    prisma.folderTag.createMany({ data: tags.map((tag) => ({ folderId: folder.id, tagId: tag.id, assignedByUserId: user.id })) })
  ]);
  revalidateLibrary();
}

export async function updateCollectionTagsAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const collectionId = idSchema.parse(formData.get("collectionId"));
  const collection = await prisma.collection.findFirst({
    where: {
      id: collectionId,
      householdId: { in: householdIds },
      ...(user.role === "admin" ? {} : { OR: [{ createdByUserId: user.id }, { visibility: "family" }] })
    },
    select: { id: true, householdId: true }
  });
  if (!collection) throw new Error("Sammlung nicht gefunden.");
  const tags = await selectedHouseholdTags(formData, collection.householdId);
  await prisma.$transaction([
    prisma.collectionTag.deleteMany({ where: { collectionId: collection.id } }),
    prisma.collectionTag.createMany({ data: tags.map((tag) => ({ collectionId: collection.id, tagId: tag.id, assignedByUserId: user.id })) })
  ]);
  revalidatePath("/collections");
  revalidatePath(`/collections/${collection.id}`);
}

export async function updateDicomSeriesTagsAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const seriesId = idSchema.parse(formData.get("seriesId"));
  const series = await prisma.dicomSeries.findFirst({
    where: {
      id: seriesId,
      study: { document: documentAccessWhere(user.id, householdIds, user.role === "admin") }
    },
    select: { id: true, study: { select: { document: { select: { id: true, householdId: true } } } } }
  });
  if (!series) throw new Error("DICOM-Serie nicht gefunden.");
  const tags = await selectedHouseholdTags(formData, series.study.document.householdId);
  await prisma.$transaction([
    prisma.dicomSeriesTag.deleteMany({ where: { dicomSeriesId: series.id } }),
    prisma.dicomSeriesTag.createMany({ data: tags.map((tag) => ({ dicomSeriesId: series.id, tagId: tag.id, assignedByUserId: user.id })) })
  ]);
  revalidatePath(`/documents/${series.study.document.id}/dicom`);
}

function trashedFolderAccess(userId: string, householdIds: string[], isAdmin = false) {
  return {
    deletedAt: { not: null },
    ...(isAdmin
      ? { householdId: { in: householdIds } }
      : { OR: [
          { visibility: "private" as const, createdByUserId: userId },
          { visibility: "family" as const, householdId: { in: householdIds } }
        ] })
  };
}

function trashedDocumentAccess(userId: string, householdIds: string[], isAdmin = false) {
  return {
    deletedAt: { not: null },
    ...(isAdmin
      ? { householdId: { in: householdIds } }
      : { OR: [
          { ownerUserId: userId },
          { visibility: "family" as const, householdId: { in: householdIds } }
        ] })
  };
}

export async function restoreTrashItemAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const parsed = z.object({ type: z.enum(["document", "folder"]), id: idSchema }).parse({
    type: formData.get("type"),
    id: formData.get("id")
  });

  if (parsed.type === "folder") {
    const folder = await prisma.folder.findFirst({ where: { id: parsed.id, ...trashedFolderAccess(user.id, householdIds, user.role === "admin") } });
    if (!folder) throw new Error("Ordner im Papierkorb nicht gefunden.");
    const formerParent = folder.deletedFromParentId
      ? await prisma.folder.findFirst({ where: { id: folder.deletedFromParentId, ...folderAccessWhere(user.id, householdIds, user.role === "admin"), visibility: folder.visibility } })
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
    const document = await prisma.document.findFirst({ where: { id: parsed.id, ...trashedDocumentAccess(user.id, householdIds, user.role === "admin") } });
    if (!document) throw new Error("Dokument im Papierkorb nicht gefunden.");
    const formerFolder = document.deletedFromFolderId
      ? await prisma.folder.findFirst({ where: { id: document.deletedFromFolderId, ...folderAccessWhere(user.id, householdIds, user.role === "admin"), visibility: document.visibility } })
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

async function permanentlyDeleteDocument(id: string) {
  const document = await prisma.document.findUnique({
    where: { id },
    select: {
      storagePath: true,
      versions: { select: { blob: { select: { id: true, storagePath: true } } } },
      dicomStudy: {
        select: { series: { select: { instances: { select: { blob: { select: { id: true, storagePath: true } } } } } } }
      }
    }
  });
  if (!document) return;
  const blobs = new Map<string, string>();
  for (const version of document.versions) blobs.set(version.blob.id, version.blob.storagePath);
  for (const series of document.dicomStudy?.series ?? []) {
    for (const instance of series.instances) blobs.set(instance.blob.id, instance.blob.storagePath);
  }
  await prisma.document.delete({ where: { id } });
  for (const [blobId, storagePath] of blobs) {
    const references = await prisma.fileBlob.findUnique({
      where: { id: blobId },
      select: { _count: { select: { versions: true, dicomInstances: true } } }
    });
    if (references && references._count.versions === 0 && references._count.dicomInstances === 0) {
      await prisma.fileBlob.delete({ where: { id: blobId } });
      await unlink(storagePath).catch(() => undefined);
    }
  }
  if (blobs.size === 0) await unlink(document.storagePath).catch(() => undefined);
  await unlink(thumbnailPath(id)).catch(() => undefined);
}

export async function permanentlyDeleteTrashItemAction(formData: FormData) {
  const { user, householdIds } = await userContext();
  const parsed = z.object({ type: z.enum(["document", "folder"]), id: idSchema }).parse({
    type: formData.get("type"),
    id: formData.get("id")
  });
  if (parsed.type === "document") {
    const document = await prisma.document.findFirst({
      where: { id: parsed.id, ...trashedDocumentAccess(user.id, householdIds, user.role === "admin") },
      select: { id: true }
    });
    if (!document) throw new Error("Dokument im Papierkorb nicht gefunden.");
    await permanentlyDeleteDocument(document.id);
  } else {
    const folder = await prisma.folder.findFirst({
      where: { id: parsed.id, ...trashedFolderAccess(user.id, householdIds, user.role === "admin"), isSystem: false },
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
    where: trashedDocumentAccess(user.id, householdIds, user.role === "admin"),
    select: { id: true }
  });
  for (const document of documents) await permanentlyDeleteDocument(document.id);
  await prisma.folder.deleteMany({ where: { ...trashedFolderAccess(user.id, householdIds, user.role === "admin"), isSystem: false } });
  revalidateLibrary();
}

export async function purgeExpiredTrash() {
  await requireUser();
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const documents = await prisma.document.findMany({
    where: { deletedAt: { lte: cutoff } },
    select: { id: true }
  });
  for (const document of documents) await permanentlyDeleteDocument(document.id);
  await prisma.folder.deleteMany({ where: { deletedAt: { lte: cutoff }, isSystem: false } });
}
