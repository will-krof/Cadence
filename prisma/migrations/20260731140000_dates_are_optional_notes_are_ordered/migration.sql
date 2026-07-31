-- Two things a list can say that it couldn't before.
--
-- A task's dates become optional. They were required, so a project that never
-- asks about dates still wrote today at both ends — an answer nobody gave, and
-- a one-day bar on the timeline standing for work nobody had placed in time.
-- Null now means unplanned, and the timeline draws no bar for it.
--
-- And a note gets a place in the pile. Notes were listed newest-touched-first,
-- which moved a note every time it was opened; the order is now the writer's
-- own, so it stays where they put it.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "developerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Note_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Note" ("content", "createdAt", "developerId", "id", "title", "updatedAt", "userId") SELECT "content", "createdAt", "developerId", "id", "title", "updatedAt", "userId" FROM "Note";
DROP TABLE "Note";
ALTER TABLE "new_Note" RENAME TO "Note";
CREATE INDEX "Note_userId_order_idx" ON "Note"("userId", "order");
CREATE INDEX "Note_developerId_order_idx" ON "Note"("developerId", "order");
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "startDate" DATETIME,
    "endDate" DATETIME,
    "order" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "sprintId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("createdAt", "description", "endDate", "id", "link", "order", "parentId", "priority", "projectId", "sprintId", "startDate", "status", "title", "updatedAt") SELECT "createdAt", "description", "endDate", "id", "link", "order", "parentId", "priority", "projectId", "sprintId", "startDate", "status", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_projectId_order_idx" ON "Task"("projectId", "order");
CREATE INDEX "Task_sprintId_order_idx" ON "Task"("sprintId", "order");
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Nothing written before today had a place in the pile, so every note keeps the
-- one it appeared in: newest touched first, counted per owner. Doing it here
-- rather than leaving a column of zeros means the first drag moves one note
-- rather than rearranging the lot.
UPDATE "Note" SET "order" = (
    SELECT COUNT(*) FROM "Note" AS other
    WHERE COALESCE(other."userId", other."developerId")
          = COALESCE("Note"."userId", "Note"."developerId")
      AND other."updatedAt" > "Note"."updatedAt"
);

-- Tasks keep the dates they have. A project that never asked about them will
-- have written today at both ends, and that stays as written: it is a plan
-- somebody may have since dragged into shape, and this migration can't tell the
-- two apart. What changes is what happens from here.
