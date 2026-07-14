import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth";
import { readOrCreateDocumentThumbnail } from "@/server/pdf/thumbnail";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const document = await prisma.document.findUnique({
    where: { id },
    select: { id: true, storagePath: true, ownerUserId: true, householdId: true, visibility: true }
  });

  if (!document) {
    return NextResponse.json({ message: "Nicht gefunden" }, { status: 404 });
  }

  const hasAccess = document.ownerUserId === user.id || (
    document.visibility === "family" && Boolean(await prisma.householdMember.findFirst({
      where: { userId: user.id, householdId: document.householdId },
      select: { id: true }
    }))
  );
  if (!hasAccess) return NextResponse.json({ message: "Nicht gefunden" }, { status: 404 });

  try {
    const thumbnail = await readOrCreateDocumentThumbnail(document.id, document.storagePath);
    return new NextResponse(new Uint8Array(thumbnail), {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Type": "image/png"
      }
    });
  } catch {
    return NextResponse.json({ message: "Vorschau konnte nicht erzeugt werden." }, { status: 404 });
  }
}
