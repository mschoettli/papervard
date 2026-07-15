import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import {
  appendUploadChunk,
  completeUploadSession,
  getUploadStatus,
  UPLOAD_CHUNK_BYTES
} from "@/server/uploads/resumable";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function uploadToken(request: Request) {
  const token = request.headers.get("Upload-Token");
  if (!token) throw new Error("Wiederaufnahme-Token fehlt.");
  return token;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const offsetHeader = request.headers.get("Upload-Offset");
    if (!offsetHeader || !/^\d+$/.test(offsetHeader)) throw new Error("Upload-Offset fehlt oder ist ungültig.");
    const chunk = Buffer.from(await request.arrayBuffer());
    if (chunk.byteLength > UPLOAD_CHUNK_BYTES) throw new Error("Der Upload-Block ist zu groß.");
    const offset = await appendUploadChunk(id, user.id, uploadToken(request), BigInt(offsetHeader), chunk);
    return new NextResponse(null, { status: 204, headers: { "Upload-Offset": offset.toString() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload-Block konnte nicht gespeichert werden.";
    return NextResponse.json({ message }, { status: message.includes("Offset") ? 409 : 400 });
  }
}

export async function HEAD(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const status = await getUploadStatus(id, user.id, uploadToken(request));
    const headers = new Headers({
      "Upload-Offset": status.offset.toString(),
      "Upload-Status": status.status,
      "Upload-Progress": String(status.processingProgress),
      "Upload-Stage": status.stage,
      "Cache-Control": "private, no-store"
    });
    if (status.error) headers.set("Upload-Error", encodeURIComponent(status.error));
    if (status.expectedSize !== null) headers.set("Upload-Length", status.expectedSize.toString());
    return new NextResponse(null, { status: 204, headers });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const result = await completeUploadSession(id, user.id, uploadToken(request));
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload konnte nicht abgeschlossen werden.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
