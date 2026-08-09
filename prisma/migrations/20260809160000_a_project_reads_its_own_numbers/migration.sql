-- A project can keep a screen of its own numbers.
--
-- Reports are a reading of the boards rather than somewhere work is kept: the
-- screen holds nothing of its own, computes what it shows from the tasks and
-- their history, and switching it off loses nothing at all.
--
-- Off to begin with, like every other tool. A project is a name and is built up.
ALTER TABLE "Project" ADD COLUMN "hasReports" BOOLEAN NOT NULL DEFAULT false;
