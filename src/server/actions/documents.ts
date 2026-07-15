"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/server/auth";
import { canShareWithHousehold, documentAccessWhere, householdIdsForUser } from "@/server/documents/access";
import { ensureUnsortedFolder, folderAccessWhere } from "@/server/documents/folders";
import { createDocumentVersion } from "@/server/documents/versions";
import { indexDocument } from "@/server/pdf/indexer";

const documentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1)
});

export async function updateDocumentAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = documentSchema.parse({
    id: formData.get("id"),
    title: formData.get("title"),
    year: formData.get("year")
  });

  const householdIds = await householdIdsForUser(admin.id);
  const accessible = await prisma.document.findFirst({
    where: { id: parsed.id, ...documentAccessWhere(admin.id, householdIds, true) },
    select: { id: true }
  });
  if (!accessible) throw new Error("Dokument nicht gefunden.");

  await prisma.document.update({
    where: { id: parsed.id },
    data: { title: parsed.title, year: parsed.year, yearLocked: true }
  });

  revalidatePath("/admin/documents");
  revalidatePath("/documents");
}

export async function reindexDocumentAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const householdIds = await householdIdsForUser(admin.id);
  const accessible = await prisma.document.findFirst({
    where: { id, ...documentAccessWhere(admin.id, householdIds, true) },
    select: { id: true }
  });
  if (!accessible) throw new Error("Dokument nicht gefunden.");
  await indexDocument(id);
  revalidatePath("/admin/documents");
  revalidatePath("/admin/uploads");
  revalidatePath(`/documents/${id}`);
}

export async function toggleFavoriteDocumentAction(formData: FormData) {
  const user = await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) throw new Error("Dokument fehlt.");

  const householdIds = await householdIdsForUser(user.id);
  const accessible = await prisma.document.findFirst({
    where: { id: documentId, ...documentAccessWhere(user.id, householdIds, user.role === "admin") },
    select: { id: true }
  });
  if (!accessible) throw new Error("Dokument nicht gefunden.");

  const existing = await prisma.favoriteDocument.findUnique({
    where: { userId_documentId: { userId: user.id, documentId } }
  });

  if (existing) {
    await prisma.favoriteDocument.delete({ where: { id: existing.id } });
  } else {
    await prisma.favoriteDocument.create({ data: { userId: user.id, documentId } });
  }

  revalidatePath("/documents");
  revalidatePath("/");
  revalidatePath(`/documents/${documentId}`);
}

export async function updateDocumentVisibilityAction(formData: FormData) {
  const user = await requireUser();
  const documentId = z.string().min(1).parse(formData.get("documentId"));
  const visibility = z.enum(["private", "family"]).parse(formData.get("visibility"));

  const document = await prisma.document.findFirst({
    where: { id: documentId, ownerUserId: user.id },
    select: { id: true, householdId: true, visibility: true }
  });
  if (!document) throw new Error("Nur der Eigentümer darf den Zugriff ändern.");
  if (visibility === "family" && !(await canShareWithHousehold(user.id, document.householdId))) {
    throw new Error("Familienzugriff ist für dieses Dokument nicht möglich.");
  }

  if (document.visibility !== visibility) {
    const folder = await ensureUnsortedFolder({
      userId: user.id,
      householdId: document.householdId,
      visibility
    });
    await prisma.document.update({ where: { id: document.id }, data: { visibility, folderId: folder.id } });
  }
  revalidatePath("/documents");
  revalidatePath(`/documents/${document.id}`);
}

export async function moveDocumentAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({ documentId: z.string().min(1), targetFolderId: z.string().min(1) }).parse({
    documentId: formData.get("documentId"),
    targetFolderId: formData.get("targetFolderId")
  });
  const householdIds = await householdIdsForUser(user.id);
  const document = await prisma.document.findFirst({
    where: { id: parsed.documentId, ...documentAccessWhere(user.id, householdIds, user.role === "admin") },
    select: { id: true, visibility: true, householdId: true, ownerUserId: true }
  });
  if (!document) throw new Error("Dokument nicht gefunden.");
  const folder = await prisma.folder.findFirst({
    where: { id: parsed.targetFolderId, ...folderAccessWhere(user.id, householdIds, user.role === "admin") }
  });
  if (!folder || folder.visibility !== document.visibility || folder.householdId !== document.householdId) {
    throw new Error("Dokumente können nicht zwischen privaten und gemeinsamen Bereichen verschoben werden.");
  }
  if (document.visibility === "private" && folder.createdByUserId !== document.ownerUserId) {
    throw new Error("Der private Zielordner ist nicht verfügbar.");
  }
  await prisma.document.update({ where: { id: document.id }, data: { folderId: folder.id } });
  revalidatePath("/documents");
  revalidatePath(`/documents/${document.id}`);
}

export async function trashDocumentAction(formData: FormData) {
  const user = await requireUser();
  const documentId = z.string().min(1).parse(formData.get("documentId"));
  const householdIds = await householdIdsForUser(user.id);
  const document = await prisma.document.findFirst({
    where: { id: documentId, ...documentAccessWhere(user.id, householdIds, user.role === "admin") },
    select: { id: true, folderId: true }
  });
  if (!document) throw new Error("Dokument nicht gefunden.");
  await prisma.document.update({
    where: { id: document.id },
    data: { deletedAt: new Date(), deletedFromFolderId: document.folderId }
  });
  revalidatePath("/documents");
  revalidatePath(`/documents/${document.id}`);
  redirect("/documents");
}

export async function restoreDocumentVersionAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({ documentId: z.string().min(1), versionId: z.string().min(1) }).parse({
    documentId: formData.get("documentId"),
    versionId: formData.get("versionId")
  });
  const householdIds = await householdIdsForUser(user.id);
  const document = await prisma.document.findFirst({
    where: { id: parsed.documentId, ...documentAccessWhere(user.id, householdIds, user.role === "admin") },
    select: {
      id: true,
      versions: {
        where: { id: parsed.versionId },
        select: { blob: { select: { checksum: true, size: true, storagePath: true, mimeType: true } } }
      }
    }
  });
  const selected = document?.versions[0];
  if (!document || !selected) throw new Error("Version nicht gefunden.");
  const version = await createDocumentVersion({
    documentId: document.id,
    checksum: selected.blob.checksum,
    size: selected.blob.size,
    storagePath: selected.blob.storagePath,
    mimeType: selected.blob.mimeType,
    source: "restore",
    authorUserId: user.id
  });
  await prisma.processingJob.createMany({ data: [
    { type: "extract", documentId: document.id, versionId: version.id, stage: "queued" },
    { type: "preview", documentId: document.id, versionId: version.id, stage: "queued" }
  ] });
  revalidatePath(`/documents/${document.id}`);
  revalidatePath("/documents");
}

export async function createDocumentNoteAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    documentId: z.string().min(1),
    text: z.string().transform((value) => value.trim()).pipe(z.string().min(1).max(10_000))
  }).parse({ documentId: formData.get("documentId"), text: formData.get("text") });
  const householdIds = await householdIdsForUser(user.id);
  const document = await prisma.document.findFirst({
    where: { id: parsed.documentId, ...documentAccessWhere(user.id, householdIds, user.role === "admin") },
    select: { id: true, currentVersionId: true }
  });
  if (!document) throw new Error("Dokument nicht gefunden.");
  await prisma.$transaction(async (transaction) => {
    const annotation = await transaction.annotation.create({
      data: {
        documentId: document.id,
        versionId: document.currentVersionId,
        authorUserId: user.id,
        kind: "note",
        data: { text: parsed.text } as Prisma.InputJsonValue
      }
    });
    await transaction.contentChange.create({
      data: {
        documentId: document.id,
        versionId: document.currentVersionId,
        actorUserId: user.id,
        kind: "comment_changed",
        details: { annotationId: annotation.id, action: "created" }
      }
    });
  });
  revalidatePath(`/documents/${document.id}`);
}

export async function deleteDocumentNoteAction(formData: FormData) {
  const user = await requireUser();
  const annotationId = z.string().min(1).parse(formData.get("annotationId"));
  const householdIds = await householdIdsForUser(user.id);
  const annotation = await prisma.annotation.findFirst({
    where: {
      id: annotationId,
      kind: "note",
      deletedAt: null,
      document: documentAccessWhere(user.id, householdIds, user.role === "admin")
    },
    select: { id: true, documentId: true, versionId: true, authorUserId: true }
  });
  if (!annotation || (annotation.authorUserId !== user.id && user.role !== "admin")) {
    throw new Error("Nur Autor oder Administrator dürfen diese Notiz löschen.");
  }
  await prisma.$transaction([
    prisma.annotation.update({ where: { id: annotation.id }, data: { deletedAt: new Date() } }),
    prisma.contentChange.create({
      data: {
        documentId: annotation.documentId,
        versionId: annotation.versionId,
        actorUserId: user.id,
        kind: "comment_changed",
        details: { annotationId: annotation.id, action: "deleted" }
      }
    })
  ]);
  revalidatePath(`/documents/${annotation.documentId}`);
}

export async function bulkDocumentAction(formData: FormData) {
  const admin = await requireAdmin();
  const action = String(formData.get("bulkAction") ?? "");
  const ids = formData.getAll("documentId").map(String).filter(Boolean);
  if (ids.length === 0) return;
  const householdIds = await householdIdsForUser(admin.id);
  const allowedDocuments = await prisma.document.findMany({
    where: { AND: [{ id: { in: ids } }, documentAccessWhere(admin.id, householdIds, true)] },
    select: { id: true }
  });
  const allowedIds = allowedDocuments.map((document) => document.id);
  if (allowedIds.length === 0) throw new Error("Keine zugänglichen Dokumente ausgewählt.");

  if (action === "reindex") {
    for (const id of allowedIds) {
      await indexDocument(id);
    }
  }

  if (action === "set-year") {
    const year = z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1).parse(formData.get("bulkYear"));
    await prisma.document.updateMany({ where: { id: { in: allowedIds } }, data: { year, yearLocked: true } });
  }

  revalidatePath("/admin/documents");
  revalidatePath("/admin/uploads");
  revalidatePath("/documents");
}
