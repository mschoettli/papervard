import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const householdIds = await householdIdsForUser(user.id);
  const instance = await prisma.dicomInstance.findFirst({
    where: {
      id,
      series: { study: { document: documentAccessWhere(user.id, householdIds, user.role === "admin") } }
    },
    include: { blob: { select: { storagePath: true, size: true } } }
  });
  if (!instance) return NextResponse.json({ message: "Nicht gefunden" }, { status: 404 });

  const fileStat = await stat(instance.blob.storagePath);
  const stream = Readable.toWeb(createReadStream(instance.blob.storagePath));
  return new NextResponse(stream as ReadableStream, {
    headers: {
      "Content-Type": "application/dicom",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `inline; filename="${instance.sopInstanceUid.replace(/[^0-9.]/g, "")}.dcm"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
