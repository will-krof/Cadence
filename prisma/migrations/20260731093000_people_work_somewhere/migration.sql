-- A profile says where in the world somebody is, and how they work there.
--
-- The zone is an IANA name rather than an offset, so the clock the card shows
-- stays right when the clocks change. Country and languages are words somebody
-- types; where they work is REMOTE, OFFICE or HYBRID, and null until anybody
-- says. Everything already on the roster keeps null, which reads as unsaid.
ALTER TABLE "Developer" ADD COLUMN "timezone" TEXT;
ALTER TABLE "Developer" ADD COLUMN "country" TEXT;
ALTER TABLE "Developer" ADD COLUMN "languages" TEXT;
ALTER TABLE "Developer" ADD COLUMN "workLocation" TEXT;
