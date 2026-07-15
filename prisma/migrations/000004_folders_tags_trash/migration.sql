CREATE TABLE "Folder" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "visibility" "DocumentVisibility" NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "parentId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "deletedFromParentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tag" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#64748b',
  "householdId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentTag" (
  "documentId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "assignedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentTag_pkey" PRIMARY KEY ("documentId", "tagId")
);

ALTER TABLE "Document"
  ADD COLUMN "folderId" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedFromFolderId" TEXT;

INSERT INTO "Folder" (
  "id", "name", "visibility", "isSystem", "createdByUserId", "householdId", "updatedAt"
)
SELECT
  'unsorted-private-' || member."userId",
  'Unsortiert',
  'private'::"DocumentVisibility",
  true,
  member."userId",
  member."householdId",
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("userId") "userId", "householdId"
  FROM "HouseholdMember"
  ORDER BY "userId", "createdAt"
) member;

INSERT INTO "Folder" (
  "id", "name", "visibility", "isSystem", "createdByUserId", "householdId", "updatedAt"
)
SELECT
  'unsorted-family-' || household."id",
  'Unsortiert',
  'family'::"DocumentVisibility",
  true,
  COALESCE(
    (SELECT member."userId" FROM "HouseholdMember" member WHERE member."householdId" = household."id" ORDER BY member."role", member."createdAt" LIMIT 1),
    (SELECT "id" FROM "User" ORDER BY "createdAt" LIMIT 1)
  ),
  household."id",
  CURRENT_TIMESTAMP
FROM "Household" household
WHERE EXISTS (SELECT 1 FROM "HouseholdMember" member WHERE member."householdId" = household."id");

UPDATE "Document"
SET "folderId" = CASE
  WHEN "visibility" = 'private'::"DocumentVisibility" THEN 'unsorted-private-' || "ownerUserId"
  ELSE 'unsorted-family-' || "householdId"
END;

ALTER TABLE "Document" ALTER COLUMN "folderId" SET NOT NULL;

CREATE INDEX "Folder_parentId_deletedAt_idx" ON "Folder"("parentId", "deletedAt");
CREATE INDEX "Folder_createdByUserId_visibility_deletedAt_idx" ON "Folder"("createdByUserId", "visibility", "deletedAt");
CREATE INDEX "Folder_householdId_visibility_deletedAt_idx" ON "Folder"("householdId", "visibility", "deletedAt");
CREATE UNIQUE INDEX "Tag_householdId_name_key" ON "Tag"("householdId", "name");
CREATE INDEX "Tag_createdByUserId_idx" ON "Tag"("createdByUserId");
CREATE INDEX "DocumentTag_tagId_idx" ON "DocumentTag"("tagId");
CREATE INDEX "DocumentTag_assignedByUserId_idx" ON "DocumentTag"("assignedByUserId");
CREATE INDEX "Document_folderId_deletedAt_idx" ON "Document"("folderId", "deletedAt");
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");

ALTER TABLE "Folder" ADD CONSTRAINT "Folder_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_assignedByUserId_fkey"
  FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
