import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { deleteDocumentExport, documentExportForUser, serializeDocumentExport } from "@/server/documents/exports";
import { isSameOriginMutation } from "@/server/security/same-origin";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  const item = await documentExportForUser(user, id);
  if (!item) return NextResponse.json({ message: "Export nicht gefunden." }, { status: 404 });
  return NextResponse.json({ export: serializeDocumentExport(item) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ message: "Ungültige Anfragequelle." }, { status: 403 });
  const user = await requireUser();
  const { id } = await context.params;
  try {
    await deleteDocumentExport(user, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Export konnte nicht entfernt werden." }, { status: 409 });
  }
}
