-- A note can be held at the top of the pile.
--
-- Kept apart from `order` rather than folded into it, so unpinning puts a note
-- back where it was in the pile instead of at the end of it. Nothing already
-- written is pinned: a pile that pinned itself would be somebody else's idea of
-- what matters.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "developerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Note_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Note" ("content", "createdAt", "developerId", "id", "order", "title", "updatedAt", "userId") SELECT "content", "createdAt", "developerId", "id", "order", "title", "updatedAt", "userId" FROM "Note";
DROP TABLE "Note";
ALTER TABLE "new_Note" RENAME TO "Note";
CREATE INDEX "Note_userId_pinned_order_idx" ON "Note"("userId", "pinned", "order");
CREATE INDEX "Note_developerId_pinned_order_idx" ON "Note"("developerId", "pinned", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
