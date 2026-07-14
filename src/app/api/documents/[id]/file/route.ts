import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { parseByteRange } from "@/server/http/byte-range";
import { readDocumentFile } from "@/server/pdf/indexer";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const file = await readDocumentFile(id, user.id);
  if (!file) return NextResponse.json({ message: "Nicht gefunden" }, { status: 404 });

  const rangeHeader = request.headers.get("range");
  const commonHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.document.originalName)}`
  };

  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, file.buffer.byteLength);
    if (!range) {
      return new NextResponse(null, {
        status: 416,
        headers: { ...commonHeaders, "Content-Range": `bytes */${file.buffer.byteLength}` }
      });
    }

    const chunk = file.buffer.subarray(range.start, range.end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: {
        ...commonHeaders,
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${range.start}-${range.end}/${file.buffer.byteLength}`
      }
    });
  }

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: { ...commonHeaders, "Content-Length": String(file.buffer.byteLength) }
  });
}
