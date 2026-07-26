-- Sprints are numbered so a project card can say which one is running.
ALTER TABLE "Sprint" ADD COLUMN "number" INTEGER NOT NULL DEFAULT 1;
