"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/server/auth";
import { indexDocument, saveUploadedPdf } from "@/server/pdf/indexer";

export async function uploadPdfAction(formData: FormData) {
  const user = await requireAdmin();
  const file = formData.get("file");
  const yearValue = String(formData.get("year") ?? "");
  const year = yearValue ? Number(yearValue) : undefined;

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Bitte eine PDF-Datei auswählen.");
  }

  const checksum = await fileChecksum(file);
  const duplicate = await prisma.document.findUnique({ where: { checksum } });
  if (duplicate) {
    revalidatePath("/admin/uploads");
    revalidatePath("/documents");
    return;
  }

  await saveUploadedPdf(file, user.id, year);
  revalidatePath("/documents");
  revalidatePath("/admin/uploads");
}

async function fileChecksum(file: File) {
  const { createHash } = await import("node:crypto");
  const buffer = Buffer.from(await file.arrayBuffer());
  return createHash("sha256").update(buffer).digest("hex");
}

const documentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1)
});

export async function updateDocumentAction(formData: FormData) {
  await requireAdmin();
  const parsed = documentSchema.parse({
    id: formData.get("id"),
    title: formData.get("title"),
    year: formData.get("year")
  });

  await prisma.document.update({
    where: { id: parsed.id },
    data: { title: parsed.title, year: parsed.year }
  });

  revalidatePath("/admin/documents");
  revalidatePath("/documents");
}

export async function reindexDocumentAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  await indexDocument(id);
  revalidatePath("/admin/documents");
  revalidatePath("/admin/uploads");
  revalidatePath(`/documents/${id}`);
}

export async function toggleFavoriteDocumentAction(formData: FormData) {
  const user = await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) throw new Error("Dokument fehlt.");

  const existing = await prisma.favoriteDocument.findUnique({
    where: { userId_documentId: { userId: user.id, documentId } }
  });

  if (existing) {
    await prisma.favoriteDocument.delete({ where: { id: existing.id } });
  } else {
    await prisma.favoriteDocument.create({ data: { userId: user.id, documentId } });
  }

  revalidatePath("/documents");
  revalidatePath(`/documents/${documentId}`);
}

export async function bulkDocumentAction(formData: FormData) {
  await requireAdmin();
  const action = String(formData.get("bulkAction") ?? "");
  const ids = formData.getAll("documentId").map(String).filter(Boolean);
  if (ids.length === 0) return;

  if (action === "reindex") {
    for (const id of ids) {
      await indexDocument(id);
    }
  }

  if (action === "set-year") {
    const year = z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1).parse(formData.get("bulkYear"));
    await prisma.document.updateMany({ where: { id: { in: ids } }, data: { year } });
  }

  revalidatePath("/admin/documents");
  revalidatePath("/admin/uploads");
  revalidatePath("/documents");
}
