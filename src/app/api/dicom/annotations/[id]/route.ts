import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth";
import { documentAccessWhere, householdIdsForUser } from "@/server/documents/access";
import { isSameOriginMutation } from "@/server/security/same-origin";

const annotationSchema = z.object({
  seriesId: z.string().min(1).optional(),
  kind: z.enum(["measurement", "roi", "drawing", "note", "segmentation", "bookmark"]),
  data: z.record(z.unknown())
});
const MAX_ANNOTATION_BYTES = 512 * 1024;

async function accessibleDocument(id: string, userId: string, isAdmin: boolean) {
  const householdIds = await householdIdsForUser(userId);
  return prisma.document.findFirst({
    where: { id, family: "dicom", ...documentAccessWhere(userId, householdIds, isAdmin) },
    select: { id: true, currentVersionId: true }
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const document = await accessibleDocument(id, user.id, user.role === "admin");
  if (!document) return NextResponse.json({ message: "Nicht gefunden" }, { status: 404 });
  const seriesId = new URL(request.url).searchParams.get("seriesId") || undefined;
  if (seriesId) {
    const series = await prisma.dicomSeries.findFirst({ where: { id: seriesId, study: { documentId: id } }, select: { id: true } });
    if (!series) return NextResponse.json({ message: "Serie nicht gefunden" }, { status: 404 });
  }
  const annotations = await prisma.annotation.findMany({
    where: { documentId: id, deletedAt: null, ...(seriesId ? { dicomSeriesId: seriesId } : {}) },
    orderBy: { createdAt: "asc" }
  });
  return NextResponse.json({ annotations });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ message: "Ungültiger Ursprung" }, { status: 403 });
  const user = await requireUser();
  const { id } = await params;
  const document = await accessibleDocument(id, user.id, user.role === "admin");
  if (!document) return NextResponse.json({ message: "Nicht gefunden" }, { status: 404 });
  const announcedSize = Number(request.headers.get("content-length") ?? 0);
  if (announcedSize > MAX_ANNOTATION_BYTES) {
    return NextResponse.json({ message: "Annotation ist zu groß" }, { status: 413 });
  }
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_ANNOTATION_BYTES) {
    return NextResponse.json({ message: "Annotation ist zu groß" }, { status: 413 });
  }
  const input = annotationSchema.parse(JSON.parse(body));
  if (input.seriesId) {
    const series = await prisma.dicomSeries.findFirst({
      where: { id: input.seriesId, study: { documentId: document.id } },
      select: { id: true }
    });
    if (!series) return NextResponse.json({ message: "Serie nicht gefunden" }, { status: 400 });
  }
  const annotation = await prisma.$transaction(async (transaction) => {
    const created = await transaction.annotation.create({
      data: {
        documentId: document.id,
        versionId: document.currentVersionId,
        dicomSeriesId: input.seriesId,
        authorUserId: user.id,
        kind: input.kind,
        data: input.data as Prisma.InputJsonValue
      }
    });
    await transaction.contentChange.create({
      data: {
        documentId: document.id,
        versionId: document.currentVersionId,
        actorUserId: user.id,
        kind: "annotation_changed",
        details: { annotationId: created.id, action: "created" }
      }
    });
    return created;
  });
  return NextResponse.json({ annotation }, { status: 201 });
}
