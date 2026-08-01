import { Readable } from "node:stream";
import { stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { documentExportForUser, openDocumentExportStream } from "@/server/documents/exports";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  const item = await documentExportForUser(user, id);
  if (!item || !item.outputPath || !["completed", "completed_with_warnings"].includes(item.status)) {
    return NextResponse.json({ message: "Export ist nicht verfügbar." }, { status: 404 });
  }
  if (!item.expiresAt || item.expiresAt <= new Date()) {
    return NextResponse.json({ message: "Export ist abgelaufen." }, { status: 410 });
  }
  try {
    const file = await stat(item.outputPath);
    const stream = Readable.toWeb(openDocumentExportStream(item.outputPath));
    return new NextResponse(stream as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(file.size),
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="papervard-export-${item.id}.zip"`
      }
    });
  } catch {
    return NextResponse.json({ message: "Exportdatei ist nicht mehr verfügbar." }, { status: 410 });
  }
}
