-- CreateEnum
CREATE TYPE "DocumentFamily" AS ENUM ('document', 'spreadsheet', 'presentation', 'image', 'email', 'ebook', 'dicom', 'archive');

-- CreateEnum
CREATE TYPE "VersionSource" AS ENUM ('upload', 'web_editor', 'smb', 'restore', 'conversion');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('uploading', 'uploaded', 'processing', 'completed', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "ProcessingJobStatus" AS ENUM ('queued', 'processing', 'awaiting_password', 'paused', 'completed', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "ProcessingJobType" AS ENUM ('ingest', 'validate', 'extract', 'preview', 'ocr', 'index', 'convert', 'import_collection', 'sync_smb');

-- CreateEnum
CREATE TYPE "AnnotationKind" AS ENUM ('comment', 'highlight', 'drawing', 'measurement', 'roi', 'segmentation', 'bookmark', 'redaction', 'note');

-- CreateEnum
CREATE TYPE "ContentChangeKind" AS ENUM ('version_created', 'version_restored', 'dicom_instance_added', 'comment_changed', 'annotation_changed', 'ownership_transferred');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "currentVersionId" TEXT,
ADD COLUMN     "family" "DocumentFamily" NOT NULL DEFAULT 'document',
ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'pdf',
ALTER COLUMN "size" SET DATA TYPE BIGINT;

-- Immutable blobs now provide byte-level deduplication. Documents may share bytes,
-- and ownership transfers must not be blocked by the former upload constraint.
DROP INDEX "Document_ownerUserId_checksum_key";
CREATE INDEX "Document_ownerUserId_checksum_idx" ON "Document"("ownerUserId", "checksum");

-- CreateTable
CREATE TABLE "FolderTag" (
    "folderId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FolderTag_pkey" PRIMARY KEY ("folderId","tagId")
);

-- CreateTable
CREATE TABLE "FileBlob" (
    "id" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileBlob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "blobId" TEXT NOT NULL,
    "source" "VersionSource" NOT NULL,
    "authorUserId" TEXT,
    "actorLabel" TEXT,
    "baseVersionId" TEXT,
    "isConflict" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- Preserve every existing PDF as immutable blob and initial version. When two
-- users previously uploaded identical bytes, both versions safely share the
-- first stored blob instead of violating the new global checksum constraint.
INSERT INTO "FileBlob" (
    "id", "checksum", "size", "mimeType", "storagePath", "createdAt"
)
SELECT DISTINCT ON (document."checksum")
    'legacy-blob-' || document."id",
    document."checksum",
    document."size",
    document."mimeType",
    document."storagePath",
    document."createdAt"
FROM "Document" document
ORDER BY document."checksum", document."createdAt", document."id";

INSERT INTO "DocumentVersion" (
    "id", "documentId", "versionNumber", "blobId", "source",
    "authorUserId", "actorLabel", "createdAt"
)
SELECT
    'legacy-version-' || document."id",
    document."id",
    1,
    'legacy-blob-' || (
        SELECT canonical."id"
        FROM "Document" canonical
        WHERE canonical."checksum" = document."checksum"
        ORDER BY canonical."createdAt", canonical."id"
        LIMIT 1
    ),
    'upload'::"VersionSource",
    document."ownerUserId",
    'Migration aus PDF-Archiv',
    document."createdAt"
FROM "Document" document;

UPDATE "Document"
SET "currentVersionId" = 'legacy-version-' || "id";

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "folderId" TEXT,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'private',
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "family" "DocumentFamily" NOT NULL,
    "expectedSize" BIGINT,
    "receivedSize" BIGINT NOT NULL DEFAULT 0,
    "stagingPath" TEXT NOT NULL,
    "resumeTokenHash" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'uploading',
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "type" "ProcessingJobType" NOT NULL,
    "status" "ProcessingJobStatus" NOT NULL DEFAULT 'queued',
    "documentId" TEXT,
    "versionId" TEXT,
    "uploadSessionId" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "checkpoint" JSONB,
    "error" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "workerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'private',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "collectionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "relativePath" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("collectionId","documentId")
);

-- CreateTable
CREATE TABLE "CollectionTag" (
    "collectionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionTag_pkey" PRIMARY KEY ("collectionId","tagId")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT,
    "dicomSeriesId" TEXT,
    "authorUserId" TEXT NOT NULL,
    "kind" "AnnotationKind" NOT NULL,
    "data" JSONB NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentChange" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT,
    "actorUserId" TEXT,
    "actorLabel" TEXT,
    "kind" "ContentChangeKind" NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DicomStudy" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "studyInstanceUid" TEXT NOT NULL,
    "patientNameCiphertext" TEXT,
    "patientBirthDateCiphertext" TEXT,
    "patientIdCiphertext" TEXT,
    "studyDate" TIMESTAMP(3),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DicomStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DicomSeries" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "seriesInstanceUid" TEXT NOT NULL,
    "seriesNumber" INTEGER,
    "modality" TEXT,
    "description" TEXT,
    "bodyPart" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DicomSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DicomInstance" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "blobId" TEXT NOT NULL,
    "sopInstanceUid" TEXT NOT NULL,
    "instanceNumber" INTEGER,
    "rows" INTEGER,
    "columns" INTEGER,
    "frames" INTEGER NOT NULL DEFAULT 1,
    "transferSyntaxUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DicomInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DicomSeriesTag" (
    "dicomSeriesId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DicomSeriesTag_pkey" PRIMARY KEY ("dicomSeriesId","tagId")
);

-- CreateTable
CREATE TABLE "SmbSyncEntry" (
    "id" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "documentId" TEXT,
    "folderId" TEXT,
    "entryType" TEXT NOT NULL,
    "lastChecksum" TEXT,
    "lastSize" BIGINT,
    "lastModifiedAt" TIMESTAMP(3),
    "syncState" TEXT NOT NULL DEFAULT 'synced',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmbSyncEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FolderTag_tagId_idx" ON "FolderTag"("tagId");

-- CreateIndex
CREATE INDEX "FolderTag_assignedByUserId_idx" ON "FolderTag"("assignedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FileBlob_checksum_key" ON "FileBlob"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "FileBlob_storagePath_key" ON "FileBlob"("storagePath");

-- CreateIndex
CREATE INDEX "DocumentVersion_blobId_idx" ON "DocumentVersion"("blobId");

-- CreateIndex
CREATE INDEX "DocumentVersion_authorUserId_idx" ON "DocumentVersion"("authorUserId");

-- CreateIndex
CREATE INDEX "DocumentVersion_baseVersionId_idx" ON "DocumentVersion"("baseVersionId");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_isConflict_idx" ON "DocumentVersion"("documentId", "isConflict");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_stagingPath_key" ON "UploadSession"("stagingPath");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_resumeTokenHash_key" ON "UploadSession"("resumeTokenHash");

-- CreateIndex
CREATE INDEX "UploadSession_ownerUserId_status_idx" ON "UploadSession"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "UploadSession_householdId_idx" ON "UploadSession"("householdId");

-- CreateIndex
CREATE INDEX "UploadSession_expiresAt_idx" ON "UploadSession"("expiresAt");

-- CreateIndex
CREATE INDEX "ProcessingJob_status_availableAt_idx" ON "ProcessingJob"("status", "availableAt");

-- CreateIndex
CREATE INDEX "ProcessingJob_documentId_idx" ON "ProcessingJob"("documentId");

-- CreateIndex
CREATE INDEX "ProcessingJob_versionId_idx" ON "ProcessingJob"("versionId");

-- CreateIndex
CREATE INDEX "ProcessingJob_uploadSessionId_idx" ON "ProcessingJob"("uploadSessionId");

-- CreateIndex
CREATE INDEX "Collection_householdId_idx" ON "Collection"("householdId");

-- CreateIndex
CREATE INDEX "Collection_createdByUserId_idx" ON "Collection"("createdByUserId");

-- CreateIndex
CREATE INDEX "Collection_householdId_visibility_idx" ON "Collection"("householdId", "visibility");

-- CreateIndex
CREATE INDEX "CollectionItem_documentId_idx" ON "CollectionItem"("documentId");

-- CreateIndex
CREATE INDEX "CollectionTag_tagId_idx" ON "CollectionTag"("tagId");

-- CreateIndex
CREATE INDEX "CollectionTag_assignedByUserId_idx" ON "CollectionTag"("assignedByUserId");

-- CreateIndex
CREATE INDEX "Annotation_documentId_createdAt_idx" ON "Annotation"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "Annotation_versionId_idx" ON "Annotation"("versionId");

-- CreateIndex
CREATE INDEX "Annotation_dicomSeriesId_idx" ON "Annotation"("dicomSeriesId");

-- CreateIndex
CREATE INDEX "Annotation_authorUserId_idx" ON "Annotation"("authorUserId");

-- CreateIndex
CREATE INDEX "ContentChange_documentId_createdAt_idx" ON "ContentChange"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentChange_versionId_idx" ON "ContentChange"("versionId");

-- CreateIndex
CREATE INDEX "ContentChange_actorUserId_idx" ON "ContentChange"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DicomStudy_documentId_key" ON "DicomStudy"("documentId");

-- CreateIndex
CREATE INDEX "DicomStudy_studyInstanceUid_idx" ON "DicomStudy"("studyInstanceUid");

-- CreateIndex
CREATE UNIQUE INDEX "DicomSeries_studyId_seriesInstanceUid_key" ON "DicomSeries"("studyId", "seriesInstanceUid");

-- CreateIndex
CREATE INDEX "DicomSeries_studyId_seriesNumber_idx" ON "DicomSeries"("studyId", "seriesNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DicomInstance_seriesId_sopInstanceUid_key" ON "DicomInstance"("seriesId", "sopInstanceUid");

-- CreateIndex
CREATE INDEX "DicomInstance_seriesId_instanceNumber_idx" ON "DicomInstance"("seriesId", "instanceNumber");

-- CreateIndex
CREATE INDEX "DicomInstance_blobId_idx" ON "DicomInstance"("blobId");

-- CreateIndex
CREATE INDEX "DicomSeriesTag_tagId_idx" ON "DicomSeriesTag"("tagId");

-- CreateIndex
CREATE INDEX "DicomSeriesTag_assignedByUserId_idx" ON "DicomSeriesTag"("assignedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SmbSyncEntry_relativePath_key" ON "SmbSyncEntry"("relativePath");

-- CreateIndex
CREATE UNIQUE INDEX "SmbSyncEntry_documentId_key" ON "SmbSyncEntry"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "SmbSyncEntry_folderId_key" ON "SmbSyncEntry"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_currentVersionId_key" ON "Document"("currentVersionId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderTag" ADD CONSTRAINT "FolderTag_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderTag" ADD CONSTRAINT "FolderTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderTag" ADD CONSTRAINT "FolderTag_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "FileBlob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_uploadSessionId_fkey" FOREIGN KEY ("uploadSessionId") REFERENCES "UploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionTag" ADD CONSTRAINT "CollectionTag_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionTag" ADD CONSTRAINT "CollectionTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionTag" ADD CONSTRAINT "CollectionTag_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_dicomSeriesId_fkey" FOREIGN KEY ("dicomSeriesId") REFERENCES "DicomSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentChange" ADD CONSTRAINT "ContentChange_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentChange" ADD CONSTRAINT "ContentChange_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentChange" ADD CONSTRAINT "ContentChange_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DicomStudy" ADD CONSTRAINT "DicomStudy_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DicomSeries" ADD CONSTRAINT "DicomSeries_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "DicomStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DicomInstance" ADD CONSTRAINT "DicomInstance_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "DicomSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DicomInstance" ADD CONSTRAINT "DicomInstance_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "FileBlob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DicomSeriesTag" ADD CONSTRAINT "DicomSeriesTag_dicomSeriesId_fkey" FOREIGN KEY ("dicomSeriesId") REFERENCES "DicomSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DicomSeriesTag" ADD CONSTRAINT "DicomSeriesTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DicomSeriesTag" ADD CONSTRAINT "DicomSeriesTag_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmbSyncEntry" ADD CONSTRAINT "SmbSyncEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmbSyncEntry" ADD CONSTRAINT "SmbSyncEntry_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
