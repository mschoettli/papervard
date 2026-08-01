import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth";
import { applyDocumentBulkOperation } from "@/server/documents/bulk-actions";
import { isSameOriginMutation } from "@/server/security/same-origin";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ message: "Ungültige Anfragequelle." }, { status: 403 });
  const user = await requireUser();
  try {
    const result = await applyDocumentBulkOperation(user, await request.json());
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mehrfachaktion fehlgeschlagen.";
    return NextResponse.json({ message }, { status: error instanceof ZodError ? 400 : 409 });
  }
}
