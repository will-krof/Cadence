/**
 * Where somebody is, measured in hours rather than in miles. A roster that
 * crosses time zones is really a roster of working days that only partly
 * overlap, so what a card stores is the zone — the one fact that stays true —
 * and the clock is worked out from it whenever anybody looks.
 *
 * Zones are IANA names, `Europe/Kyiv` and the like, because they carry their
 * own daylight saving with them. An offset would be right until March.
 */

/**
 * The zones offered when the browser or the server won't list its own. Modern
 * engines all answer `Intl.supportedValuesOf`, so this is a floor rather than a
 * list anybody should have to maintain: enough of the world to pick something
 * near, with the rest arriving as soon as the runtime can say.
 */
const FALLBACK_ZONES = [
  "UTC",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Berlin",
  "Europe/Warsaw",
  "Europe/Kyiv",
  "Europe/Istanbul",
  "Asia/Jerusalem",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

/** Every zone this runtime knows, sorted, or the floor above. */
export function timezoneNames(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;
  try {
    const zones = supported?.("timeZone");
    if (zones && zones.length > 0) return zones;
  } catch {
    // An engine that has the method but not the table. The floor will do.
  }
  return FALLBACK_ZONES;
}

/**
 * Whether a string names a zone this runtime can actually keep time in. Asked
 * of the formatter rather than of a list, because the list is what the
 * formatter would accept and the formatter is what will be handed it later.
 */
export function isTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

/** "Europe/Kyiv" as somebody would say it: "Kyiv · Europe". */
export function zoneLabel(zone: string): string {
  const parts = zone.split("/").map((part) => part.replace(/_/g, " "));
  if (parts.length === 1) return parts[0];
  return `${parts[parts.length - 1]} · ${parts[0]}`;
}

// Formatters are expensive to build and a roster draws one per person per
// minute, so each zone keeps the two it needs.
const clocks = new Map<string, Intl.DateTimeFormat>();
const calendars = new Map<string, Intl.DateTimeFormat>();

function clockFor(zone: string) {
  let found = clocks.get(zone);
  if (!found) {
    found = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      // h23 rather than a locale's guess: a roster reads better when every
      // clock on it is written the same way, and 24-hour has no am to lose.
      hourCycle: "h23",
    });
    clocks.set(zone, found);
  }
  return found;
}

function calendarFor(zone: string) {
  let found = calendars.get(zone);
  if (!found) {
    found = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    calendars.set(zone, found);
  }
  return found;
}

/** "14:32" where they are, or null if the zone is one we can't keep. */
export function timeIn(zone: string, at: Date = new Date()): string | null {
  try {
    return clockFor(zone).format(at);
  } catch {
    return null;
  }
}

/**
 * How far ahead of UTC a zone is at a given moment, in minutes. Worked out by
 * asking the formatter what the wall clock reads there and treating that
 * reading as though it were UTC — the gap between the two is the offset, and it
 * comes out right through daylight saving without a table of rules.
 */
export function zoneOffsetMinutes(
  zone: string,
  at: Date = new Date()
): number | null {
  try {
    const parts = calendarFor(zone).formatToParts(at);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const wall = Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second")
    );
    if (Number.isNaN(wall)) return null;
    return Math.round((wall - at.getTime()) / 60_000);
  } catch {
    return null;
  }
}

/** The zone this browser is in. Empty on the server, which has no reader. */
export function viewerZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * The zone in the reader's terms: "3h ahead of you", "1h 30m behind you", or
 * "same time as you". Null when there is nothing to say — no reader's zone to
 * compare against, or a zone we can't keep time in.
 *
 * The difference is what a colleague actually wants: not that somebody is on
 * UTC+5:30, but that a message sent now lands in their evening.
 */
export function offsetFromViewer(
  zone: string,
  at: Date = new Date()
): string | null {
  const here = viewerZone();
  if (!here) return null;
  const theirs = zoneOffsetMinutes(zone, at);
  const ours = zoneOffsetMinutes(here, at);
  if (theirs === null || ours === null) return null;

  const minutes = theirs - ours;
  if (minutes === 0) return "same time as you";

  const ahead = minutes > 0;
  const size = Math.abs(minutes);
  const hours = Math.floor(size / 60);
  const rest = size % 60;
  const span = [hours ? `${hours}h` : null, rest ? `${rest}m` : null]
    .filter(Boolean)
    .join(" ");
  return `${span} ${ahead ? "ahead of" : "behind"} you`;
}
