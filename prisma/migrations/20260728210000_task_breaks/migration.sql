-- A task can stand still and be picked up again. A pause breaks its bar on the
-- timeline rather than moving it: the work ran as long as it ran, and the gap
-- is where it waited. A null end means it is still paused.
CREATE TABLE "TaskBreak" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskBreak_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TaskBreak_taskId_startDate_idx" ON "TaskBreak"("taskId", "startDate");
