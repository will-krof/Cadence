export function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function diffDays(a: Date, b: Date) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function toISODate(d: Date) {
  const copy = startOfDay(d);
  const y = copy.getFullYear();
  const m = String(copy.getMonth() + 1).padStart(2, "0");
  const day = String(copy.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export function weekdayLetter(d: Date) {
  return WEEKDAY_LETTERS[d.getDay()];
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "27 Jul 2026" — day first, month named. Written out rather than left to the
 * viewer's locale so a date never reads as 07/01 to one person and 01/07 to
 * another. `toISODate` still handles anything that has to round-trip.
 */
export function formatDay(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** The same, without the year, for tight spots inside one season's work. */
export function formatDayShort(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "6 Jul – 17 Jul 2026", collapsing what the two ends have in common. */
export function formatRange(from: Date | string, to: Date | string) {
  const start = typeof from === "string" ? new Date(from) : from;
  const end = typeof to === "string" ? new Date(to) : to;
  if (start.getFullYear() !== end.getFullYear()) {
    return `${formatDay(start)} – ${formatDay(end)}`;
  }
  return `${formatDayShort(start)} – ${formatDay(end)}`;
}
