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
