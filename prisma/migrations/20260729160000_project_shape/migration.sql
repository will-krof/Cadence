-- A project says what it is made of. Sprints and roles join the boards and the
-- wiki as tools that can be switched off; the span can be stated rather than
-- worked out from the tasks; and each of a task's optional fields can be put
-- away, so a form asks only what the team actually fills in.
--
-- Everything defaults to what the app did before, so existing projects open
-- exactly as they did.
ALTER TABLE "Project" ADD COLUMN "hasSprints" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Project" ADD COLUMN "hasRoles" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Project" ADD COLUMN "startDate" DATETIME;
ALTER TABLE "Project" ADD COLUMN "endDate" DATETIME;
ALTER TABLE "Project" ADD COLUMN "taskHasPriority" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Project" ADD COLUMN "taskHasLink" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Project" ADD COLUMN "taskHasDates" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Project" ADD COLUMN "taskHasHistory" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Project" ADD COLUMN "taskHasComments" BOOLEAN NOT NULL DEFAULT true;
