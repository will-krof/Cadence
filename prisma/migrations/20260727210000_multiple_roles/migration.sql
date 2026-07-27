-- Someone can hold more than one of a project's roles, so the pairing moves
-- out of the membership row and into its own table.
CREATE TABLE "MemberRole" (
    "memberId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    PRIMARY KEY ("memberId", "roleId"),
    CONSTRAINT "MemberRole_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ProjectMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MemberRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "ProjectRole" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MemberRole_roleId_idx" ON "MemberRole"("roleId");

-- Whatever single role people hold today, they keep.
INSERT INTO "MemberRole" ("memberId", "roleId")
SELECT "id", "roleId" FROM "ProjectMember" WHERE "roleId" IS NOT NULL;

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ProjectMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectMember_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_ProjectMember" ("id", "projectId", "developerId", "createdAt")
SELECT "id", "projectId", "developerId", "createdAt" FROM "ProjectMember";

DROP TABLE "ProjectMember";
ALTER TABLE "new_ProjectMember" RENAME TO "ProjectMember";

CREATE UNIQUE INDEX "ProjectMember_projectId_developerId_key" ON "ProjectMember"("projectId", "developerId");
CREATE INDEX "ProjectMember_developerId_idx" ON "ProjectMember"("developerId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
