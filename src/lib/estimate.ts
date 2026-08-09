/**
 * How long a task is expected to take, in the two units anybody writes it in.
 *
 * A team says "three days" or "four hours" about the same kind of thing, and
 * which of the two they reach for is a habit rather than a fact about the work.
 * So the quantity is stored once, in minutes, and the unit is only how it is
 * said: switching the picker converts what is already typed instead of asking
 * for it again, and two tasks written in different units still add up.
 */

/**
 * A day of work, not a day of the world. Eight hours is the length of the day
 * this app counts in — an estimate in days is an estimate in working days, and
 * nobody means twenty-four of them.
 */
export const HOURS_PER_DAY = 8;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;

export type EstimateUnit = "HOURS" | "DAYS";

export const ESTIMATE_UNITS: { value: EstimateUnit; label: string }[] = [
  { value: "HOURS", label: "Hours" },
  { value: "DAYS", label: "Days" },
];

/** Minutes in one of that unit. */
export function minutesPer(unit: EstimateUnit) {
  return unit === "DAYS" ? MINUTES_PER_DAY : MINUTES_PER_HOUR;
}

export function isEstimateUnit(value: unknown): value is EstimateUnit {
  return value === "HOURS" || value === "DAYS";
}

/**
 * A year of working days. Past this somebody has typed a phone number into the
 * box rather than an estimate, and a plan measured in centuries is not a plan.
 */
export const MAX_ESTIMATE_MINUTES = 260 * MINUTES_PER_DAY;

/**
 * How many of `unit` a stored estimate is. Kept to two decimals: a quarter of
 * an hour and half a day both survive, and the trailing noise a binary fraction
 * would leave behind doesn't.
 */
export function inUnit(minutes: number, unit: EstimateUnit) {
  return Math.round((minutes / minutesPer(unit)) * 100) / 100;
}

/** The same number as a string for an input, without a pointless `.00`. */
export function amountFor(minutes: number | null, unit: EstimateUnit) {
  if (minutes == null) return "";
  return String(inUnit(minutes, unit));
}

/**
 * What somebody typed, as minutes. Null is an empty box — an estimate nobody
 * has given, which is a real answer and the one most tasks have.
 */
export function toMinutes(
  amount: string | number,
  unit: EstimateUnit
): number | null {
  const raw = typeof amount === "number" ? amount : amount.trim();
  if (raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(
    MAX_ESTIMATE_MINUTES,
    Math.max(1, Math.round(value * minutesPer(unit)))
  );
}

/**
 * An estimate said the way a person would: "2d", "1d 4h", "45m". Days first
 * because that is the unit a plan is read in, and the remainder only when there
 * is one — "2d" rather than "2d 0h".
 */
export function formatEstimate(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "";

  const days = Math.floor(minutes / MINUTES_PER_DAY);
  const hours = Math.floor((minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (rest > 0) parts.push(`${rest}m`);
  return parts.join(" ");
}

/**
 * The same estimate said in the unit it wasn't written in, for the line under
 * the field: somebody typing days is told what that is in hours, and the other
 * way round. Empty when the two would read the same.
 */
export function otherUnit(
  minutes: number | null,
  unit: EstimateUnit
): string {
  if (minutes == null || minutes <= 0) return "";
  const other: EstimateUnit = unit === "DAYS" ? "HOURS" : "DAYS";
  const amount = inUnit(minutes, other);
  const word = other === "DAYS" ? "day" : "hour";
  return `${amount} ${amount === 1 ? word : `${word}s`}`;
}
