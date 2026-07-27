-- A project runs several sprints, and a task belongs to one of them, so each
-- sprint is its own board.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- The old table allowed one sprint per project. Rebuilt so a project can hold
-- a series of them, numbered.
CREATE TABLE "new_Sprint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Sprint" ("id", "projectId", "number", "startDate", "endDate", "createdAt", "updatedAt")
SELECT "id", "projectId", "number", "startDate", "endDate", "updatedAt", "updatedAt" FROM "Sprint";

DROP TABLE "Sprint";
ALTER TABLE "new_Sprint" RENAME TO "Sprint";

CREATE UNIQUE INDEX "Sprint_projectId_number_key" ON "Sprint"("projectId", "number");
CREATE INDEX "Sprint_projectId_idx" ON "Sprint"("projectId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Which board a task sits on.
ALTER TABLE "Task" ADD COLUMN "sprintId" TEXT REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Task_sprintId_order_idx" ON "Task"("sprintId", "order");

-- Projects whose work predates sprints get one covering it, so nothing lands
-- on a board that isn't there.
INSERT INTO "Sprint" ("id", "projectId", "number", "startDate", "endDate", "updatedAt")
SELECT
    lower(hex(randomblob(12))),
    p."id",
    1,
    COALESCE((SELECT MIN(t."startDate") FROM "Task" t WHERE t."projectId" = p."id"), CURRENT_TIMESTAMP),
    COALESCE((SELECT MAX(t."endDate") FROM "Task" t WHERE t."projectId" = p."id"), CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM "Project" p
WHERE NOT EXISTS (SELECT 1 FROM "Sprint" s WHERE s."projectId" = p."id");

-- Everything that exists today belongs to its project's first sprint.
UPDATE "Task"
SET "sprintId" = (
    SELECT s."id" FROM "Sprint" s
    WHERE s."projectId" = "Task"."projectId"
    ORDER BY s."number" ASC
    LIMIT 1
)
WHERE "sprintId" IS NULL;
