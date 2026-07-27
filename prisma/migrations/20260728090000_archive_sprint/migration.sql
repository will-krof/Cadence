-- A finished sprint can be put away without deleting it or its tasks.
ALTER TABLE "Sprint" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
