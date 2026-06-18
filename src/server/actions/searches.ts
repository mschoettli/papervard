"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth";

const savedSearchSchema = z.object({
  name: z.string().trim().min(1).max(80),
  query: z.string().trim().min(2).max(300),
  yearFrom: z.coerce.number().int().min(1900).max(2100).optional().or(z.literal("")),
  yearTo: z.coerce.number().int().min(1900).max(2100).optional().or(z.literal("")),
  title: z.string().trim().max(160).optional(),
  mode: z.enum(["hybrid", "keyword", "semantic"]).default("hybrid")
});

function optionalNumber(value: unknown) {
  return value === "" || value == null ? undefined : Number(value);
}

export async function saveSearchAction(formData: FormData) {
  const user = await requireUser();
  const parsed = savedSearchSchema.parse({
    name: formData.get("name"),
    query: formData.get("query"),
    yearFrom: optionalNumber(formData.get("yearFrom")),
    yearTo: optionalNumber(formData.get("yearTo")),
    title: formData.get("title") || undefined,
    mode: formData.get("mode") || "hybrid"
  });

  await prisma.savedSearch.create({
    data: {
      userId: user.id,
      name: parsed.name,
      query: parsed.query,
      yearFrom: parsed.yearFrom || null,
      yearTo: parsed.yearTo || null,
      title: parsed.title || null,
      mode: parsed.mode
    }
  });

  revalidatePath("/search");
}

export async function deleteSavedSearchAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.savedSearch.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/search");
}
