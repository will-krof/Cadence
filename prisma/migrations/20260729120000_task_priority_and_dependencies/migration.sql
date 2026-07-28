-- Which of two waiting tasks gets picked up first. Everything already written
-- is ordinary work, which is what the default says.
ALTER TABLE "Task" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'MEDIUM';

-- One task waiting on another: the blocker finishes, then the blocked one can
-- start. Deleting either end takes the link — a dependency on work that no
-- longer exists is not a dependency.
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskDependency_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskDependency_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Said twice is said once.
CREATE UNIQUE INDEX "TaskDependency_blockerId_blockedId_key" ON "TaskDependency"("blockerId", "blockedId");
-- Read from either end: what this waits on, and what waits on it.
CREATE INDEX "TaskDependency_blockedId_idx" ON "TaskDependency"("blockedId");
CREATE INDEX "TaskDependency_blockerId_idx" ON "TaskDependency"("blockerId");
