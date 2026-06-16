import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { readDocumentFile } from "@/server/pdf/indexer";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const file = await readDocumentFile(id);
  if (!file) return NextResponse.json({ message: "Nicht gefunden" }, { status: 404 });

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.document.originalName)}"`
    }
  });
}
