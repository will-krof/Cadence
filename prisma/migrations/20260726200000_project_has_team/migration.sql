-- Team roster becomes a per-project toggle like the other two tools.
ALTER TABLE "Project" ADD COLUMN "hasTeam" BOOLEAN NOT NULL DEFAULT true;
