import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { findAccessibleDocumentFile } from "@/server/documents/file";
import { parseByteRange } from "@/server/http/byte-range";

export const runtime = "nodejs";

function safeInlineMimeType(mimeType: string) {
  if (mimeType === "application/pdf" || mimeType === "text/plain") return mimeType;
  if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") return mimeType;
  return "application/octet-stream";
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const file = await findAccessibleDocumentFile(id, user.id, user.role === "admin");
  if (!file) return NextResponse.json({ message: "Nicht gefunden" }, { status: 404 });

  const rangeHeader = request.headers.get("range");
  const commonHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Type": safeInlineMimeType(file.mimeType),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
  };

  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, file.size);
    if (!range) {
      return new NextResponse(null, {
        status: 416,
        headers: { ...commonHeaders, "Content-Range": `bytes */${file.size}` }
      });
    }

    const stream = Readable.toWeb(createReadStream(file.storagePath, { start: range.start, end: range.end }));
    return new NextResponse(stream as ReadableStream, {
      status: 206,
      headers: {
        ...commonHeaders,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`
      }
    });
  }

  const stream = Readable.toWeb(createReadStream(file.storagePath));
  return new NextResponse(stream as ReadableStream, {
    headers: { ...commonHeaders, "Content-Length": String(file.size) }
  });
}
