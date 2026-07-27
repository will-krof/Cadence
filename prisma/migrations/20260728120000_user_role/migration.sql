-- Every account is an admin of its own workspace. Superadmin is granted from the
-- command line and buys nothing but install-wide counts.
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'ADMIN';
