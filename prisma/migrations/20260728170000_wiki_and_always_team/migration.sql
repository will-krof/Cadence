-- Every project has people, so the roster stopped being a tool to switch off:
-- what a role may open is still the role's business, but the project no longer
-- has a say. The column goes.
ALTER TABLE "Project" DROP COLUMN "hasTeam";

-- A wiki is a tool, and it works the way the boards do: the project carries it,
-- and a role opens it. Existing projects get one; existing roles get it only
-- where they already run the project.
ALTER TABLE "Project" ADD COLUMN "hasWiki" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ProjectRole" ADD COLUMN "canViewWiki" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ProjectRole" SET "canViewWiki" = true WHERE "isAdmin" = true;

CREATE TABLE "WikiPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WikiPage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WikiPage_projectId_order_idx" ON "WikiPage"("projectId", "order");
