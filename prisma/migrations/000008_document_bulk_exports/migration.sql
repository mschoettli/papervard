CREATE TYPE "DocumentExportStatus" AS ENUM (
  'queued',
  'processing',
  'completed',
  'completed_with_warnings',
  'failed',
  'canceled',
  'expired'
);

CREATE TYPE "DocumentExportItemStatus" AS ENUM ('queued', 'completed', 'skipped');

ALTER TYPE "ProcessingJobType" ADD VALUE 'document_export';

CREATE TABLE "DocumentExport" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "status" "DocumentExportStatus" NOT NULL DEFAULT 'queued',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "totalItems" INTEGER NOT NULL DEFAULT 0,
  "completedItems" INTEGER NOT NULL DEFAULT 0,
  "skippedItems" INTEGER NOT NULL DEFAULT 0,
  "outputPath" TEXT,
  "outputSize" BIGINT,
  "error" TEXT,
  "warnings" JSONB,
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentExport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentExportItem" (
  "id" TEXT NOT NULL,
  "exportId" TEXT NOT NULL,
  "documentId" TEXT,
  "versionId" TEXT,
  "sourcePath" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  "status" "DocumentExportItemStatus" NOT NULL DEFAULT 'queued',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentExportItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProcessingJob" ADD COLUMN "exportId" TEXT;

CREATE UNIQUE INDEX "DocumentExport_outputPath_key" ON "DocumentExport"("outputPath");
CREATE INDEX "DocumentExport_ownerUserId_createdAt_idx" ON "DocumentExport"("ownerUserId", "createdAt");
CREATE INDEX "DocumentExport_status_expiresAt_idx" ON "DocumentExport"("status", "expiresAt");
CREATE INDEX "DocumentExportItem_exportId_status_idx" ON "DocumentExportItem"("exportId", "status");
CREATE INDEX "DocumentExportItem_documentId_idx" ON "DocumentExportItem"("documentId");
CREATE INDEX "DocumentExportItem_versionId_idx" ON "DocumentExportItem"("versionId");
CREATE UNIQUE INDEX "ProcessingJob_exportId_key" ON "ProcessingJob"("exportId");

ALTER TABLE "DocumentExport"
  ADD CONSTRAINT "DocumentExport_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentExportItem"
  ADD CONSTRAINT "DocumentExportItem_exportId_fkey"
  FOREIGN KEY ("exportId") REFERENCES "DocumentExport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentExportItem"
  ADD CONSTRAINT "DocumentExportItem_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentExportItem"
  ADD CONSTRAINT "DocumentExportItem_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProcessingJob"
  ADD CONSTRAINT "ProcessingJob_exportId_fkey"
  FOREIGN KEY ("exportId") REFERENCES "DocumentExport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
