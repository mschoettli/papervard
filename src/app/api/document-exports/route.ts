import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth";
import { createDocumentExport, listDocumentExports } from "@/server/documents/exports";
import { isSameOriginMutation } from "@/server/security/same-origin";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json(
    { exports: await listDocumentExports(user) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ message: "Ungültige Anfragequelle." }, { status: 403 });
  const user = await requireUser();
  try {
    const body = await request.json() as { selection?: unknown };
    const created = await createDocumentExport(user, body.selection);
    // createDocumentExport persists the snapshot and its processingJob atomically.
    return NextResponse.json({ export: created }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export konnte nicht gestartet werden.";
    return NextResponse.json({ message }, { status: error instanceof ZodError ? 400 : 409 });
  }
}
