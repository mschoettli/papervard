CREATE TABLE "FavoriteDocument" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FavoriteDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedSearch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "yearFrom" INTEGER,
  "yearTo" INTEGER,
  "title" TEXT,
  "mode" TEXT NOT NULL DEFAULT 'hybrid',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FavoriteDocument_userId_documentId_key" ON "FavoriteDocument"("userId", "documentId");
CREATE INDEX "FavoriteDocument_documentId_idx" ON "FavoriteDocument"("documentId");
CREATE INDEX "SavedSearch_userId_idx" ON "SavedSearch"("userId");

ALTER TABLE "FavoriteDocument"
  ADD CONSTRAINT "FavoriteDocument_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "FavoriteDocument"
  ADD CONSTRAINT "FavoriteDocument_documentId_fkey"
  FOREIGN KEY ("documentId")
  REFERENCES "Document"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "SavedSearch"
  ADD CONSTRAINT "SavedSearch_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
