import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";
import { saveImageEdit } from "@/server/editing/versions";
import { isSameOriginMutation } from "@/server/security/same-origin";

export const runtime = "nodejs";

const operationSchema = z.object({
  baseVersionId: z.string().min(1).max(200),
  rotate: z.union([z.literal(90), z.literal(180), z.literal(270)]).optional(),
  flipHorizontal: z.boolean().optional(),
  flipVertical: z.boolean().optional()
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ message: "Ungültiger Ursprung." }, { status: 403 });
  try {
    const user = await requireUser();
    const { id } = await params;
    const householdIds = await householdIdsForUser(user.id);
    const document = await prisma.document.findFirst({
      where: { id, ...documentAccessWhere(user.id, householdIds, user.role === "admin") },
      select: { id: true }
    });
    if (!document) return NextResponse.json({ message: "Nicht gefunden" }, { status: 404 });
    const input = operationSchema.parse(await request.json());
    const version = await saveImageEdit(document.id, user.id, input, input.baseVersionId);
    return NextResponse.json({ versionId: version.id, versionNumber: version.versionNumber, conflict: version.isConflict });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Bild konnte nicht gespeichert werden." }, { status: 400 });
  }
}
