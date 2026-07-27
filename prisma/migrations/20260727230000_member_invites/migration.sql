-- Each membership carries the invite link that lets that person into the
-- project. Rotating the link is a new token; revoking it leaves the row.
ALTER TABLE "ProjectMember" ADD COLUMN "inviteToken" TEXT;
ALTER TABLE "ProjectMember" ADD COLUMN "inviteCreatedAt" DATETIME;
ALTER TABLE "ProjectMember" ADD COLUMN "inviteRevoked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectMember" ADD COLUMN "inviteUsedAt" DATETIME;

-- A token is what the invite route looks a member up by, so it has to be unique.
-- SQLite treats NULLs as distinct, so memberships without a link are fine.
CREATE UNIQUE INDEX "ProjectMember_inviteToken_key" ON "ProjectMember"("inviteToken");
