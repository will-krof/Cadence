-- A project's tracker columns become rows it owns, rather than five statuses
-- this app decided on. Every project already in the database keeps exactly the
-- board it had: the five old statuses are written out as its columns, in the
-- order they were always drawn, and every task and every line of history is
-- pointed at the column that means what its status meant.
--
-- New projects start with none. An empty tracker is the honest starting point:
-- a team says what its own states are called before it has work standing in
-- them.

-- CreateTable
CREATE TABLE "ProjectColumn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#898781',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectColumn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The board every project had, written down as the board it now owns. The ids
-- are derived from the project's own so the task and history updates below can
-- name them without a second pass.
INSERT INTO "ProjectColumn" ("id", "name", "color", "order", "isDone", "projectId")
SELECT "id" || ':TODO', 'To Do', '#898781', 0, false, "id" FROM "Project";
INSERT INTO "ProjectColumn" ("id", "name", "color", "order", "isDone", "projectId")
SELECT "id" || ':IN_PROGRESS', 'In progress', '#fab219', 1, false, "id" FROM "Project";
INSERT INTO "ProjectColumn" ("id", "name", "color", "order", "isDone", "projectId")
SELECT "id" || ':IN_TEST', 'In test', '#2a78d6', 2, false, "id" FROM "Project";
INSERT INTO "ProjectColumn" ("id", "name", "color", "order", "isDone", "projectId")
SELECT "id" || ':ON_HOLD', 'On hold', '#ec835a', 3, false, "id" FROM "Project";
INSERT INTO "ProjectColumn" ("id", "name", "color", "order", "isDone", "projectId")
SELECT "id" || ':DONE', 'Done', '#0ca30c', 4, true, "id" FROM "Project";

-- CreateIndex
CREATE INDEX "ProjectColumn_projectId_order_idx" ON "ProjectColumn"("projectId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectColumn_projectId_name_key" ON "ProjectColumn"("projectId", "name");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "link" TEXT,
    "columnId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "startDate" DATETIME,
    "endDate" DATETIME,
    "estimateMinutes" INTEGER,
    "estimateUnit" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "sprintId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "ProjectColumn" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Task" ("id", "title", "description", "link", "columnId", "priority", "startDate", "endDate", "estimateMinutes", "estimateUnit", "order", "projectId", "parentId", "sprintId", "createdAt", "updatedAt")
SELECT "id", "title", "description", "link", "projectId" || ':' || "status", "priority", "startDate", "endDate", "estimateMinutes", "estimateUnit", "order", "projectId", "parentId", "sprintId", "createdAt", "updatedAt"
FROM "Task";

DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_projectId_order_idx" ON "Task"("projectId", "order");
CREATE INDEX "Task_sprintId_order_idx" ON "Task"("sprintId", "order");
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");
CREATE INDEX "Task_columnId_idx" ON "Task"("columnId");

CREATE TABLE "new_TaskEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "columnId" TEXT,
    "columnName" TEXT NOT NULL,
    "fromId" TEXT,
    "fromName" TEXT,
    "by" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskEvent_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "ProjectColumn" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaskEvent_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "ProjectColumn" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- The history keeps the names as they read at the time, which is the bargain it
-- already made with `by`: the old statuses were called these things, so that is
-- what the lines say.
INSERT INTO "new_TaskEvent" ("id", "taskId", "columnId", "columnName", "fromId", "fromName", "by", "at")
SELECT
    e."id",
    e."taskId",
    t."projectId" || ':' || e."status",
    CASE e."status"
        WHEN 'TODO' THEN 'To Do'
        WHEN 'IN_PROGRESS' THEN 'In progress'
        WHEN 'IN_TEST' THEN 'In test'
        WHEN 'ON_HOLD' THEN 'On hold'
        WHEN 'DONE' THEN 'Done'
        ELSE e."status"
    END,
    CASE WHEN e."from" IS NULL THEN NULL ELSE t."projectId" || ':' || e."from" END,
    CASE e."from"
        WHEN 'TODO' THEN 'To Do'
        WHEN 'IN_PROGRESS' THEN 'In progress'
        WHEN 'IN_TEST' THEN 'In test'
        WHEN 'ON_HOLD' THEN 'On hold'
        WHEN 'DONE' THEN 'Done'
        ELSE e."from"
    END,
    e."by",
    e."at"
FROM "TaskEvent" e
JOIN "Task" t ON t."id" = e."taskId";

DROP TABLE "TaskEvent";
ALTER TABLE "new_TaskEvent" RENAME TO "TaskEvent";
CREATE INDEX "TaskEvent_taskId_at_idx" ON "TaskEvent"("taskId", "at");
CREATE INDEX "TaskEvent_columnId_idx" ON "TaskEvent"("columnId");
CREATE INDEX "TaskEvent_fromId_idx" ON "TaskEvent"("fromId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
