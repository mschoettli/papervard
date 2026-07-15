import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { findAccessibleDocumentFile } from "@/server/documents/file";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const file = await findAccessibleDocumentFile(id, user.id, user.role === "admin");
  if (!file) return NextResponse.json({ message: "Nicht gefunden" }, { status: 404 });

  const stream = Readable.toWeb(createReadStream(file.storagePath));
  return new NextResponse(stream as ReadableStream, {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "private, no-store",
      "Content-Length": String(file.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
    }
  });
}
