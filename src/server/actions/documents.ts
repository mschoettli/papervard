"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/auth";
import { indexDocument, saveUploadedPdf } from "@/server/pdf/indexer";

export async function uploadPdfAction(formData: FormData) {
  const user = await requireAdmin();
  const file = formData.get("file");
  const yearValue = String(formData.get("year") ?? "");
  const year = yearValue ? Number(yearValue) : undefined;

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Bitte eine PDF-Datei auswählen.");
  }

  await saveUploadedPdf(file, user.id, year);
  revalidatePath("/documents");
  revalidatePath("/admin/uploads");
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
