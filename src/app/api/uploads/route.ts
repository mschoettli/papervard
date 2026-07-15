import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth";
import { resolveUploadFolder } from "@/server/documents/folders";
import { createUploadSession } from "@/server/uploads/resumable";
import { isSameOriginMutation } from "@/server/security/same-origin";

export const runtime = "nodejs";

const uploadRequestSchema = z.object({
  originalName: z.string().min(1).max(512),
  mimeType: z.string().max(255).default("application/octet-stream"),
  size: z.string().regex(/^\d+$/).transform((value) => BigInt(value)).optional(),
  visibility: z.enum(["private", "family"]).default("private"),
  folderId: z.string().min(1).optional()
});

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ message: "Ungültiger Ursprung." }, { status: 403 });
  try {
    const user = await requireUser();
    const input = uploadRequestSchema.parse(await request.json());
    const membership = await prisma.householdMember.findFirst({
      where: { userId: user.id },
      select: { householdId: true }
    });
    if (!membership) return NextResponse.json({ message: "Keine Familie eingerichtet." }, { status: 400 });

    const folder = await resolveUploadFolder({
      requestedFolderId: input.folderId,
      userId: user.id,
      householdId: membership.householdId,
      visibility: input.visibility
    });
    const session = await createUploadSession({
      ownerUserId: user.id,
      householdId: membership.householdId,
      folderId: folder.id,
      visibility: input.visibility,
      originalName: input.originalName,
      mimeType: input.mimeType,
      expectedSize: input.size
    });

    return NextResponse.json({
      ...session,
      offset: session.offset.toString()
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload konnte nicht angelegt werden.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
