import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@papervard.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Papervard-Admin-123!";
  const resetPassword = process.env.SEED_ADMIN_RESET_PASSWORD === "true";
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing && !resetPassword) {
    const admin = await prisma.user.update({
      where: { email },
      data: { role: "admin", active: true }
    });
    await ensureFamilyMembership(admin.id);
    console.log(`Admin user already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "admin", active: true },
    create: {
      email,
      name: "Papervard Admin",
      passwordHash,
      role: "admin",
      active: true
    }
  });
  await ensureFamilyMembership(admin.id);

  console.log(`Seeded admin user: ${email}`);
}

async function ensureFamilyMembership(userId: string) {
  const household = await prisma.household.upsert({
    where: { id: "papervard-family" },
    update: {},
    create: { id: "papervard-family", name: "Familie" }
  });
  await prisma.householdMember.upsert({
    where: { householdId_userId: { householdId: household.id, userId } },
    update: { role: "owner" },
    create: { householdId: household.id, userId, role: "owner" }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
