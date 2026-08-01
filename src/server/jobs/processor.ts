import "server-only";

import type { ProcessingJob } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { importArchiveCollection } from "@/server/collections/archive";
import { ProtectedDocumentError } from "@/server/extract/tika";
import { extractDocumentContent } from "@/server/jobs/extract-document";
import { ingestUploadSession } from "@/server/jobs/ingest";
import { prepareDocumentPreview } from "@/server/jobs/preview-document";
import { processDocumentExport } from "@/server/documents/exports";
import {
  claimNextJob,
  completeJob,
  failJob,
  updateJobProgress,
  waitForPassword
} from "@/server/jobs/queue";

async function runClaimedJob(job: ProcessingJob) {
  switch (job.type) {
    case "document_export":
      if (!job.exportId) throw new Error("Exportauftrag hat keinen Exportbezug.");
      await processDocumentExport(job.exportId, async (progress, stage) => {
        await updateJobProgress(job.id, progress, stage);
      });
      return;
    case "ingest":
      if (!job.uploadSessionId) throw new Error("Importauftrag hat keine Upload-Sitzung.");
      await updateJobProgress(job.id, 10, "validating");
      await ingestUploadSession(job.uploadSessionId);
      return;
    case "extract":
      if (!job.documentId) throw new Error("Extraktionsauftrag hat kein Dokument.");
      await updateJobProgress(job.id, 10, "extracting");
      await extractDocumentContent(job.documentId);
      return;
    case "preview":
      if (!job.documentId) throw new Error("Vorschauauftrag hat kein Dokument.");
      await updateJobProgress(job.id, 10, "previewing");
      await prepareDocumentPreview(job.documentId);
      return;
    case "import_collection":
      if (!job.documentId) throw new Error("Sammlungsauftrag hat kein Archivdokument.");
      await importArchiveCollection(job.documentId, async (progress, stage) => {
        await updateJobProgress(job.id, progress, stage);
      });
      return;
    default:
      throw new Error(`Auftragstyp ${job.type} ist im Worker noch nicht verfügbar.`);
  }
}

export async function processNextJob(workerId: string) {
  const job = await claimNextJob(workerId);
  if (!job) return false;

  try {
    await runClaimedJob(job);
    await completeJob(job.id);
  } catch (error) {
    if (error instanceof ProtectedDocumentError) {
      await waitForPassword(job.id, error.message);
    } else {
      const implemented = job.type === "ingest" || job.type === "extract" || job.type === "preview" || job.type === "import_collection" || job.type === "document_export";
      const failedJob = await failJob(job, error, implemented);
      if (job.type === "document_export" && job.exportId && failedJob.status === "queued") {
        await prisma.documentExport.update({ where: { id: job.exportId }, data: { status: "queued" } });
      }
    }
  }
  return true;
}
