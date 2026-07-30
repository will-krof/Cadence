-- A project labels its work in its own words.
--
-- Tags are the project's own rows, with a name and a colour, and a task wears
-- as many of them as it likes. Tags start switched off, like every other half
-- of a task: a project is a name, and is built up.
-- CreateTable
CREATE TABLE "ProjectTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#2a78d6',
    "projectId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectTag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskTag" (
    "taskId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("taskId", "tagId"),
    CONSTRAINT "TaskTag_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ProjectTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
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
    "taskHasSubtasks" BOOLEAN NOT NULL DEFAULT false,
    "taskHasDependencies" BOOLEAN NOT NULL DEFAULT false,
    "taskHasTags" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("archived", "createdAt", "description", "endDate", "hasRoles", "hasSprints", "hasTimeline", "hasTracker", "hasWiki", "id", "name", "startDate", "taskHasComments", "taskHasDates", "taskHasDependencies", "taskHasHistory", "taskHasLink", "taskHasPriority", "taskHasSubtasks", "userId") SELECT "archived", "createdAt", "description", "endDate", "hasRoles", "hasSprints", "hasTimeline", "hasTracker", "hasWiki", "id", "name", "startDate", "taskHasComments", "taskHasDates", "taskHasDependencies", "taskHasHistory", "taskHasLink", "taskHasPriority", "taskHasSubtasks", "userId" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProjectTag_projectId_idx" ON "ProjectTag"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTag_projectId_name_key" ON "ProjectTag"("projectId", "name");

-- CreateIndex
CREATE INDEX "TaskTag_tagId_idx" ON "TaskTag"("tagId");
