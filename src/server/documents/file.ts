import "server-only";

import { stat } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";

export async function findAccessibleDocumentFile(documentId: string, userId: string, isAdmin = false) {
  const householdIds = await householdIdsForUser(userId);
  const document = await prisma.document.findFirst({
    where: { id: documentId, ...documentAccessWhere(userId, householdIds, isAdmin) },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      storagePath: true,
      format: true,
      family: true
    }
  });
  if (!document) return null;

  const fileStat = await stat(document.storagePath);
  if (!fileStat.isFile()) return null;
  return { ...document, size: fileStat.size };
}
