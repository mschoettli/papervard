"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/server/auth";
import { canShareWithHousehold, documentAccessWhere, householdIdsForUser } from "@/server/documents/access";
import { indexDocument, saveUploadedPdf } from "@/server/pdf/indexer";

const MAX_PDF_SIZE = 50 * 1024 * 1024;
const MAX_UPLOAD_SIZE = 75 * 1024 * 1024;

const uploadSchema = z.object({
  year: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1).optional()
  ),
  visibility: z.enum(["private", "family"]).default("private")
});

export async function uploadPdfAction(formData: FormData) {
  const user = await requireUser();
  const files = formData
    .getAll("file")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const { year, visibility } = uploadSchema.parse({
    year: formData.get("year"),
    visibility: formData.get("visibility") ?? "private"
  });

  if (files.length === 0) {
    throw new Error("Bitte mindestens eine PDF-Datei auswählen.");
  }

  if (files.some((file) => file.size > MAX_PDF_SIZE)) {
    throw new Error("Eine PDF darf höchstens 50 MB groß sein.");
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_UPLOAD_SIZE) {
    throw new Error("Pro Upload sind insgesamt höchstens 75 MB erlaubt.");
  }

  const membership = await prisma.householdMember.findFirst({
    where: { userId: user.id },
    select: { householdId: true }
  });
  if (!membership) throw new Error("Für diesen Benutzer ist keine Familie eingerichtet.");

  for (const file of files) {
    await saveUploadedPdf(file, {
      ownerUserId: user.id,
      householdId: membership.householdId,
      visibility,
      yearOverride: year
    });
  }

  revalidatePath("/documents");
  revalidatePath("/admin/uploads");
}

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
    where: { id: parsed.id, ...documentAccessWhere(admin.id, householdIds) },
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
    where: { id, ...documentAccessWhere(admin.id, householdIds) },
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
    where: { id: documentId, ...documentAccessWhere(user.id, householdIds) },
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
    select: { id: true, householdId: true }
  });
  if (!document) throw new Error("Nur der Eigentümer darf den Zugriff ändern.");
  if (visibility === "family" && !(await canShareWithHousehold(user.id, document.householdId))) {
    throw new Error("Familienzugriff ist für dieses Dokument nicht möglich.");
  }

  await prisma.document.update({ where: { id: document.id }, data: { visibility } });
  revalidatePath("/documents");
  revalidatePath(`/documents/${document.id}`);
}

export async function bulkDocumentAction(formData: FormData) {
  const admin = await requireAdmin();
  const action = String(formData.get("bulkAction") ?? "");
  const ids = formData.getAll("documentId").map(String).filter(Boolean);
  if (ids.length === 0) return;
  const householdIds = await householdIdsForUser(admin.id);
  const allowedDocuments = await prisma.document.findMany({
    where: { AND: [{ id: { in: ids } }, documentAccessWhere(admin.id, householdIds)] },
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
