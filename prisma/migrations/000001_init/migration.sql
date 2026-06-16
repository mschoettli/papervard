CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "Role" AS ENUM ('admin', 'user');
CREATE TYPE "IndexStatus" AS ENUM ('queued', 'processing', 'indexed', 'failed');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'user',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Document" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "pageCount" INTEGER NOT NULL DEFAULT 0,
  "indexStatus" "IndexStatus" NOT NULL DEFAULT 'queued',
  "indexError" TEXT,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TextChunk" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "page" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "tsv" tsvector,
  "embedding" vector(384),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TextChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Document_checksum_key" ON "Document"("checksum");
CREATE INDEX "Document_year_idx" ON "Document"("year");
CREATE INDEX "Document_indexStatus_idx" ON "Document"("indexStatus");
CREATE INDEX "TextChunk_documentId_idx" ON "TextChunk"("documentId");
CREATE INDEX "TextChunk_tsv_idx" ON "TextChunk" USING GIN ("tsv");
CREATE INDEX "TextChunk_embedding_idx" ON "TextChunk" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

ALTER TABLE "TextChunk"
  ADD CONSTRAINT "TextChunk_documentId_fkey"
  FOREIGN KEY ("documentId")
  REFERENCES "Document"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
