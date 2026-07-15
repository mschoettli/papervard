import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";
import { saveTextEdit } from "@/server/editing/versions";
import { isSameOriginMutation } from "@/server/security/same-origin";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const baseVersionId = request.headers.get("Papervard-Base-Version");
    if (!baseVersionId || baseVersionId.length > 200) throw new Error("Ausgangsversion fehlt.");
    const version = await saveTextEdit(document.id, user.id, await request.text(), baseVersionId);
    return NextResponse.json({ versionId: version.id, versionNumber: version.versionNumber, conflict: version.isConflict });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Text konnte nicht gespeichert werden." }, { status: 400 });
  }
}
