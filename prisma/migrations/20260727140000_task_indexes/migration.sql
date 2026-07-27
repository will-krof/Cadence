-- The board's query is "one project's tasks, ordered", so the sort belongs in
-- the index; the person view filters by assignee, which had no index at all.
DROP INDEX IF EXISTS "Task_projectId_idx";
CREATE INDEX "Task_projectId_order_idx" ON "Task"("projectId", "order");
CREATE INDEX "Task_developerId_idx" ON "Task"("developerId");
