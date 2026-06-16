import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@papervard.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Papervard-Admin-123!";
  const resetPassword = process.env.SEED_ADMIN_RESET_PASSWORD === "true";
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing && !resetPassword) {
    await prisma.user.update({
      where: { email },
      data: { role: "admin", active: true }
    });
    console.log(`Admin user already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
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

  console.log(`Seeded admin user: ${email} / ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
