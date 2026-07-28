-- A role can now watch a tool or work in it, rather than only reach it. The
-- roles that already ran a project keep both; everybody else keeps what they
-- had, which was watching.
ALTER TABLE "ProjectRole" ADD COLUMN "canEditTimeline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectRole" ADD COLUMN "canEditTracker" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectRole" ADD COLUMN "canEditTeam" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectRole" ADD COLUMN "canEditWiki" BOOLEAN NOT NULL DEFAULT false;
-- Boards were writable by anyone who could open one, so that is what the
-- existing roles are given: what they could already do, said out loud.
UPDATE "ProjectRole" SET "canEditTimeline" = "canViewTimeline",
                         "canEditTracker" = "canViewTracker";

-- A person's card carries when they were born and where they are this week.
ALTER TABLE "Developer" ADD COLUMN "birthday" DATETIME;
ALTER TABLE "Developer" ADD COLUMN "workStatus" TEXT;

-- And a project can be put away.
ALTER TABLE "Project" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
