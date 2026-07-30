-- A task is done by up to four people, not by one.
--
-- The single `Task.developerId` becomes a join: one row per person on a task.
-- Every assignment that exists is copied into it before the column goes, so
-- nobody comes off the work they are on.
-- CreateTable
CREATE TABLE "TaskAssignee" (
    "taskId" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("taskId", "developerId"),
    CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskAssignee_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Everyone already on a task stays on it, as the first name in its short list.
INSERT INTO "TaskAssignee" ("taskId", "developerId", "order")
SELECT "id", "developerId", 0 FROM "Task" WHERE "developerId" IS NOT NULL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProjectRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "canViewTimeline" BOOLEAN NOT NULL DEFAULT true,
    "canEditTimeline" BOOLEAN NOT NULL DEFAULT false,
    "canViewTracker" BOOLEAN NOT NULL DEFAULT true,
    "canEditTracker" BOOLEAN NOT NULL DEFAULT false,
    "canViewTeam" BOOLEAN NOT NULL DEFAULT true,
    "canEditTeam" BOOLEAN NOT NULL DEFAULT false,
    "canViewWiki" BOOLEAN NOT NULL DEFAULT true,
    "canEditWiki" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProjectRole" ("canEditTeam", "canEditTimeline", "canEditTracker", "canEditWiki", "canViewTeam", "canViewTimeline", "canViewTracker", "canViewWiki", "createdAt", "id", "isAdmin", "name", "projectId") SELECT "canEditTeam", "canEditTimeline", "canEditTracker", "canEditWiki", "canViewTeam", "canViewTimeline", "canViewTracker", "canViewWiki", "createdAt", "id", "isAdmin", "name", "projectId" FROM "ProjectRole";
DROP TABLE "ProjectRole";
ALTER TABLE "new_ProjectRole" RENAME TO "ProjectRole";
CREATE INDEX "ProjectRole_projectId_idx" ON "ProjectRole"("projectId");
CREATE UNIQUE INDEX "ProjectRole_projectId_name_key" ON "ProjectRole"("projectId", "name");
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
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

-- CreateIndex
CREATE INDEX "TaskAssignee_developerId_taskId_idx" ON "TaskAssignee"("developerId", "taskId");
