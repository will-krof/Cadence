-- Roles decide which of a project's tools a group of people sees.
CREATE TABLE "ProjectRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "canViewTimeline" BOOLEAN NOT NULL DEFAULT true,
    "canViewTracker" BOOLEAN NOT NULL DEFAULT true,
    "canViewTeam" BOOLEAN NOT NULL DEFAULT true,
    "projectId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProjectRole_projectId_idx" ON "ProjectRole"("projectId");
CREATE UNIQUE INDEX "ProjectRole_projectId_name_key" ON "ProjectRole"("projectId", "name");

-- Projects that already exist get the same two roles a new project starts with.
INSERT INTO "ProjectRole" ("id", "name", "isAdmin", "canViewTimeline", "canViewTracker", "canViewTeam", "projectId")
SELECT lower(hex(randomblob(12))), 'admin', true, true, true, true, "id" FROM "Project";

INSERT INTO "ProjectRole" ("id", "name", "isAdmin", "canViewTimeline", "canViewTracker", "canViewTeam", "projectId")
SELECT lower(hex(randomblob(12))), 'developer', false, true, true, false, "id" FROM "Project";
