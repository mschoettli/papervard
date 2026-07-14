CREATE TYPE "HouseholdRole" AS ENUM ('owner', 'member');
CREATE TYPE "DocumentVisibility" AS ENUM ('private', 'family');

CREATE TABLE "Household" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HouseholdMember" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "HouseholdRole" NOT NULL DEFAULT 'member',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Household" ("id", "name", "updatedAt")
VALUES ('papervard-family', 'Familie', CURRENT_TIMESTAMP);

INSERT INTO "HouseholdMember" ("id", "householdId", "userId", "role")
SELECT
  'family-member-' || "id",
  'papervard-family',
  "id",
  CASE
    WHEN "role" = 'admin' OR "id" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
      THEN 'owner'::"HouseholdRole"
    ELSE 'member'::"HouseholdRole"
  END
FROM "User";

ALTER TABLE "Document"
  ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "householdId" TEXT,
  ADD COLUMN "yearLocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "visibility" "DocumentVisibility" NOT NULL DEFAULT 'private';

UPDATE "Document" AS document
SET
  "ownerUserId" = COALESCE(
    (SELECT "id" FROM "User" WHERE "id" = document."uploadedById"),
    (SELECT "id" FROM "User" WHERE "role" = 'admin' ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  ),
  "householdId" = 'papervard-family',
  "visibility" = 'family';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Document" WHERE "ownerUserId" IS NULL) THEN
    RAISE EXCEPTION 'Existing documents require at least one user before family access can be migrated.';
  END IF;
END $$;

ALTER TABLE "Document"
  ALTER COLUMN "ownerUserId" SET NOT NULL,
  ALTER COLUMN "householdId" SET NOT NULL,
  DROP COLUMN "uploadedById";

DROP INDEX "Document_checksum_key";

CREATE UNIQUE INDEX "HouseholdMember_householdId_userId_key" ON "HouseholdMember"("householdId", "userId");
CREATE INDEX "HouseholdMember_userId_idx" ON "HouseholdMember"("userId");
CREATE UNIQUE INDEX "Document_ownerUserId_checksum_key" ON "Document"("ownerUserId", "checksum");
CREATE INDEX "Document_ownerUserId_idx" ON "Document"("ownerUserId");
CREATE INDEX "Document_householdId_visibility_idx" ON "Document"("householdId", "visibility");

ALTER TABLE "HouseholdMember"
  ADD CONSTRAINT "HouseholdMember_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HouseholdMember"
  ADD CONSTRAINT "HouseholdMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
