-- A wiki grows sections, and sections of sections, as deep as a project needs.
ALTER TABLE "WikiPage" ADD COLUMN "parentId" TEXT REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX IF EXISTS "WikiPage_projectId_order_idx";
CREATE INDEX "WikiPage_projectId_parentId_order_idx" ON "WikiPage"("projectId", "parentId", "order");

-- A task can be made of steps. They are tasks themselves — they have a status,
-- dates and an assignee — so they live in the same table, under their parent.
ALTER TABLE "Task" ADD COLUMN "parentId" TEXT REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");
