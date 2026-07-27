-- An invite link now leads to a login rather than straight into the project,
-- and it only lives three days.
ALTER TABLE "Developer" ADD COLUMN "username" TEXT;
ALTER TABLE "Developer" ADD COLUMN "passwordHash" TEXT;
CREATE UNIQUE INDEX "Developer_username_key" ON "Developer"("username");

ALTER TABLE "ProjectMember" ADD COLUMN "inviteExpiresAt" DATETIME;

-- Links made before this migration get the same three days from now, rather
-- than counting from a creation date that has already passed.
UPDATE "ProjectMember"
SET "inviteExpiresAt" = datetime('now', '+3 days')
WHERE "inviteToken" IS NOT NULL;

-- Signed-in team members. Their own table: a session here is a person holding
-- roles, not an account holding a workspace.
CREATE TABLE "DeveloperSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeveloperSession_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DeveloperSession_tokenHash_key" ON "DeveloperSession"("tokenHash");
CREATE INDEX "DeveloperSession_developerId_idx" ON "DeveloperSession"("developerId");
