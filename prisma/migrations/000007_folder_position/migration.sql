ALTER TABLE "Folder"
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY
        "parentId",
        "visibility",
        "householdId",
        CASE WHEN "visibility" = 'private'
          THEN "createdByUserId" ELSE "householdId" END
      ORDER BY "isSystem" DESC, "name" ASC, "createdAt" ASC
    ) - 1 AS "nextPosition"
  FROM "Folder"
)
UPDATE "Folder"
SET "position" = ranked."nextPosition"
FROM ranked
WHERE "Folder"."id" = ranked."id";

DROP INDEX IF EXISTS "Folder_parentId_deletedAt_idx";
CREATE INDEX "Folder_parentId_position_deletedAt_idx"
ON "Folder"("parentId", "position", "deletedAt");
