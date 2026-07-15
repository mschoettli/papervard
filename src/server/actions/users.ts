"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/server/auth";

const userSchema = z.object({
  email: z.string().trim().email("Bitte gib eine gültige E-Mail-Adresse ein."),
  name: z.string().trim().min(2, "Der Name muss mindestens 2 Zeichen lang sein."),
  password: z.string().min(10, "Das Passwort muss mindestens 10 Zeichen lang sein."),
  role: z.enum(["admin", "user"])
});

export type CreateUserState = {
  message?: string;
  ok?: boolean;
};

export async function createUserAction(_: CreateUserState | undefined, formData: FormData): Promise<CreateUserState> {
  await requireAdmin();
  const parsed = userSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    role: formData.get("role")
  });

  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Bitte prüfe die Eingaben." };
  }

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await prisma.$transaction(async (transaction) => {
      const household = await transaction.household.upsert({
        where: { id: "papervard-family" },
        update: {},
        create: { id: "papervard-family", name: "Familie" }
      });
      const createdUser = await transaction.user.create({
        data: {
          email: parsed.data.email.toLowerCase(),
          name: parsed.data.name,
          passwordHash,
          role: parsed.data.role,
          householdMemberships: {
            create: { householdId: household.id, role: "member" }
          }
        }
      });
      await transaction.folder.createMany({
        data: [
          {
            id: `unsorted-private-${createdUser.id}`,
            name: "Unsortiert",
            visibility: "private",
            isSystem: true,
            createdByUserId: createdUser.id,
            householdId: household.id
          },
          {
            id: `unsorted-family-${household.id}`,
            name: "Unsortiert",
            visibility: "family",
            isSystem: true,
            createdByUserId: createdUser.id,
            householdId: household.id
          }
        ],
        skipDuplicates: true
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { message: "Für diese E-Mail-Adresse gibt es bereits ein Konto." };
    }
    throw error;
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "Nutzer wurde erstellt." };
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
