import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = "admin@papervard.local";
  const password = "Papervard-Admin-123!";
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
