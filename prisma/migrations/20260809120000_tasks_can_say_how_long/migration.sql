-- A task can say how long it is expected to take.
--
-- Stored as one quantity in minutes rather than as a number and a unit that
-- have to be read together: hours and days are two ways of saying the same
-- thing, so the thing is what is kept, and the unit rides along only so the
-- form says it back the way it was typed.
--
-- The field starts off, like every other half of a task a project can put
-- away. Nobody was being asked for an estimate before today, so switching it on
-- for existing projects would be answering a question on their behalf.
ALTER TABLE "Task" ADD COLUMN "estimateMinutes" INTEGER;
ALTER TABLE "Task" ADD COLUMN "estimateUnit" TEXT;
ALTER TABLE "Project" ADD COLUMN "taskHasEstimate" BOOLEAN NOT NULL DEFAULT false;
