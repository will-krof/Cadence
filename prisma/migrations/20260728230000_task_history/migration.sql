-- Pauses go. A gap in a bar was a second account of the same fact, kept by
-- hand; what a task actually needs is its own history.
DROP TABLE IF EXISTS "TaskBreak";

-- Every status a task was moved to, when, and by whom as they were called at
-- the time. Written as it happens rather than worked out afterwards.
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "from" TEXT,
    "by" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TaskEvent_taskId_at_idx" ON "TaskEvent"("taskId", "at");
