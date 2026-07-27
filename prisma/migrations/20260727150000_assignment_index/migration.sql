-- Widening the assignee index to cover the project too lets the team roster's
-- "who works where" read straight from the index.
DROP INDEX IF EXISTS "Task_developerId_idx";
CREATE INDEX "Task_developerId_projectId_idx" ON "Task"("developerId", "projectId");
