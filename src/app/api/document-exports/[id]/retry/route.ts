import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { retryDocumentExport } from "@/server/documents/exports";
import { isSameOriginMutation } from "@/server/security/same-origin";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ message: "Ungültige Anfragequelle." }, { status: 403 });
  const user = await requireUser();
  const { id } = await context.params;
  try {
    return NextResponse.json({ export: await retryDocumentExport(user, id) }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Export konnte nicht wiederholt werden." }, { status: 409 });
  }
}
