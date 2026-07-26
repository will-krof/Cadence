-- Turns Developer into a full people profile.
ALTER TABLE "Developer" ADD COLUMN "role" TEXT;
ALTER TABLE "Developer" ADD COLUMN "email" TEXT;
ALTER TABLE "Developer" ADD COLUMN "phone" TEXT;
ALTER TABLE "Developer" ADD COLUMN "avatar" TEXT;
ALTER TABLE "Developer" ADD COLUMN "startDate" DATETIME;
ALTER TABLE "Developer" ADD COLUMN "salary" INTEGER;
ALTER TABLE "Developer" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "Developer" ADD COLUMN "employmentType" TEXT;
ALTER TABLE "Developer" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Developer" ADD COLUMN "notes" TEXT;
