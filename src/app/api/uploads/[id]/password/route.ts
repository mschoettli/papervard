import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth";
import { importArchiveCollection } from "@/server/collections/archive";
import { ProtectedDocumentError } from "@/server/extract/tika";
import { completeJob, updateJobProgress, waitForPassword } from "@/server/jobs/queue";
import { getUploadStatus } from "@/server/uploads/resumable";

export const runtime = "nodejs";
const inputSchema = z.object({ password: z.string().min(1).max(1024) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const token = request.headers.get("Upload-Token");
  if (!token) return NextResponse.json({ message: "Wiederaufnahme-Token fehlt." }, { status: 403 });
  try {
    await getUploadStatus(id, user.id, token);
    const { password } = inputSchema.parse(await request.json());
    const job = await prisma.processingJob.findFirst({
      where: { uploadSessionId: id, status: "awaiting_password" },
      orderBy: { createdAt: "asc" }
    });
    if (!job?.documentId || job.type !== "import_collection") {
      throw new Error("Für diesen Dateityp ist keine Passwortübergabe verfügbar.");
    }
    await prisma.processingJob.update({ where: { id: job.id }, data: { status: "processing", error: null, stage: "password-retry" } });
    try {
      await importArchiveCollection(job.documentId, async (progress, stage) => {
        await updateJobProgress(job.id, progress, stage);
      }, password);
      await completeJob(job.id);
      return NextResponse.json({ status: "completed" });
    } catch (error) {
      if (error instanceof ProtectedDocumentError) {
        await waitForPassword(job.id, "Passwort ist falsch oder das Archiv wird nicht unterstützt.");
      }
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Passwort konnte nicht geprüft werden." }, { status: 400 });
  }
}
