"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/auth";

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(10),
  role: z.enum(["admin", "user"])
});

export async function createUserAction(formData: FormData) {
  await requireAdmin();
  const parsed = userSchema.parse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    role: formData.get("role")
  });

  await prisma.user.create({
    data: {
      email: parsed.email.toLowerCase(),
      name: parsed.name,
      passwordHash: await bcrypt.hash(parsed.password, 12),
      role: parsed.role
    }
  });

  revalidatePath("/admin/users");
}

export async function toggleUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  if (id === admin.id) return;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return;

  await prisma.user.update({
    where: { id },
    data: { active: !user.active }
  });

  revalidatePath("/admin/users");
}
