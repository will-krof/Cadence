-- A new project starts as a name and a description, and is asked what it is
-- made of. Every tool and every optional task field now defaults to off, so the
-- first screen after creating one is the question "what do you need?" rather
-- than a project that arrived with everything and has to be pared back.
--
-- Only the defaults change. The rows are copied across as they stand, so every
-- project that already exists keeps exactly the shape it had.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hasTimeline" BOOLEAN NOT NULL DEFAULT false,
    "hasTracker" BOOLEAN NOT NULL DEFAULT false,
    "hasWiki" BOOLEAN NOT NULL DEFAULT false,
    "hasSprints" BOOLEAN NOT NULL DEFAULT false,
    "hasRoles" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "taskHasPriority" BOOLEAN NOT NULL DEFAULT false,
    "taskHasLink" BOOLEAN NOT NULL DEFAULT false,
    "taskHasDates" BOOLEAN NOT NULL DEFAULT false,
    "taskHasHistory" BOOLEAN NOT NULL DEFAULT false,
    "taskHasComments" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("archived", "createdAt", "description", "endDate", "hasRoles", "hasSprints", "hasTimeline", "hasTracker", "hasWiki", "id", "name", "startDate", "taskHasComments", "taskHasDates", "taskHasHistory", "taskHasLink", "taskHasPriority", "userId") SELECT "archived", "createdAt", "description", "endDate", "hasRoles", "hasSprints", "hasTimeline", "hasTracker", "hasWiki", "id", "name", "startDate", "taskHasComments", "taskHasDates", "taskHasHistory", "taskHasLink", "taskHasPriority", "userId" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
