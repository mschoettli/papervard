import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/server/security/signed-token";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const payload = verifyToken(token, "office-file");
    if (typeof payload.documentId !== "string" || typeof payload.versionId !== "string") {
      throw new Error("Ungültige Dateireferenz.");
    }
    const version = await prisma.documentVersion.findFirst({
      where: { id: payload.versionId, documentId: payload.documentId },
      include: {
        blob: { select: { storagePath: true, mimeType: true } },
        document: { select: { originalName: true } }
      }
    });
    if (!version) return NextResponse.json({ message: "Nicht gefunden" }, { status: 404 });
    const fileStat = await stat(version.blob.storagePath);
    const stream = Readable.toWeb(createReadStream(version.blob.storagePath));
    return new NextResponse(stream as ReadableStream, {
      headers: {
        "Content-Type": version.blob.mimeType,
        "Content-Length": String(fileStat.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(version.document.originalName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return NextResponse.json({ message: "Ungültiger oder abgelaufener Zugriff." }, { status: 403 });
  }
}
