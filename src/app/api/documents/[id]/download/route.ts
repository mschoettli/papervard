import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { readDocumentFile } from "@/server/pdf/indexer";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const file = await readDocumentFile(id, user.id);
  if (!file) return NextResponse.json({ message: "Nicht gefunden" }, { status: 404 });

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.document.originalName)}`
    }
  });
}
