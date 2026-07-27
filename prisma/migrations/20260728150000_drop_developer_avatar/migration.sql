-- Avatars are gone: a profile is drawn from its initial and its colour, so the
-- workspace stores no images at all. Dropping the column takes the data URLs
-- that were sitting in the row with it.
ALTER TABLE "Developer" DROP COLUMN "avatar";
