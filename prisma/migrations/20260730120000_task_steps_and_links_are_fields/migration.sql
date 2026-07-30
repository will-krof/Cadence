-- Steps and dependencies join the rest of a task's optional halves, so a
-- project can say it doesn't break work down, or doesn't order it, and stop
-- being asked.
--
-- New projects start with both off, like every other field — a project is a
-- name and is built up. Projects that already exist were being asked for both
-- all along, so they are switched on: nothing anybody is already using
-- disappears on the way past this migration.
ALTER TABLE "Project" ADD COLUMN "taskHasSubtasks" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "taskHasDependencies" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Project" SET "taskHasSubtasks" = true, "taskHasDependencies" = true;
