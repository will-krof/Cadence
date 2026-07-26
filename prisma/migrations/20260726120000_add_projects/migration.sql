-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hasTimeline" BOOLEAN NOT NULL DEFAULT true,
    "hasTracker" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backfill: existing tasks and the singleton sprint belong to one default project.
-- createdAt is stored as epoch milliseconds to match how Prisma writes
-- DateTime on SQLite; CURRENT_TIMESTAMP would store TEXT and sort apart.
INSERT INTO "Project" ("id", "name", "description", "hasTimeline", "hasTracker", "createdAt")
VALUES ('default_project', 'My project', NULL, true, true, CAST(strftime('%s','now') AS INTEGER) * 1000);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,
    "developerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("id", "title", "description", "link", "status", "startDate", "endDate", "order", "projectId", "developerId", "createdAt", "updatedAt")
SELECT "id", "title", "description", "link", "status", "startDate", "endDate", "order", 'default_project', "developerId", "createdAt", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

CREATE TABLE "new_Sprint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Sprint" ("id", "projectId", "startDate", "endDate", "updatedAt")
SELECT "id", 'default_project', "startDate", "endDate", "updatedAt" FROM "Sprint";
DROP TABLE "Sprint";
ALTER TABLE "new_Sprint" RENAME TO "Sprint";
CREATE UNIQUE INDEX "Sprint_projectId_key" ON "Sprint"("projectId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
