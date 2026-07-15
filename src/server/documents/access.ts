import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DocumentScope = "all" | "mine" | "family" | "favorites";

export async function householdIdsForUser(userId: string) {
  const memberships = await prisma.householdMember.findMany({
    where: { userId },
    select: { householdId: true }
  });

  return memberships.map((membership) => membership.householdId);
}

export function documentAccessWhere(userId: string, householdIds: string[], isAdmin = false): Prisma.DocumentWhereInput {
  return {
    AND: [
      { deletedAt: null },
      {
        OR: [
          { ownerUserId: userId },
          isAdmin
            ? { householdId: { in: householdIds } }
            : { visibility: "family", householdId: { in: householdIds } }
        ]
      }
    ]
  };
}

export function documentScopeWhere(
  userId: string,
  householdIds: string[],
  scope: DocumentScope,
  isAdmin = false
): Prisma.DocumentWhereInput {
  const access = documentAccessWhere(userId, householdIds, isAdmin);

  if (scope === "mine") return { AND: [access, { ownerUserId: userId }] };
  if (scope === "family") {
    return {
      AND: [
        access,
        { visibility: "family", householdId: { in: householdIds } }
      ]
    };
  }
  if (scope === "favorites") {
    return { AND: [access, { favorites: { some: { userId } } }] };
  }

  return access;
}

export async function canShareWithHousehold(userId: string, householdId: string) {
  return Boolean(
    await prisma.householdMember.findFirst({
      where: { userId, householdId },
      select: { id: true }
    })
  );
}
