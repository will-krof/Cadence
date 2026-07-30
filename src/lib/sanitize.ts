/**
 * What the server will accept from a browser, in one place. Every field here is
 * something a signed-in person types, and some of them come back out into an
 * `href` or a style, so the rules are about what can't be allowed to travel
 * rather than about tidy input.
 */

/** Caps, so one request can't fill a row with a megabyte of text. */
export const LIMITS = {
  name: 120,
  title: 200,
  description: 5_000,
  link: 2_000,
  notes: 5_000,
  email: 200,
  phone: 40,
  roleName: 60,
  /** A tag is a word or two — anything longer is a description. */
  tagName: 24,
  /** A wiki page is the one long thing here — a chapter, not a book. */
  wiki: 100_000,
  /** scrypt is deliberately slow, so a password is not an open-ended input. */
  password: 200,
  /** Nobody holds hundreds of roles on one project. */
  roleIds: 50,
} as const;

/**
 * A link that is safe to put in an `href`. Only http and https survive:
 * `javascript:` and `data:` in a link are a script waiting for a click, and no
 * task needs them.
 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > LIMITS.link) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * The same question, asked cheaply: does this string begin as an http or https
 * URL? Boards draw hundreds of rows, and parsing a URL per row per render is
 * work for nothing when the server already stored a parsed one. What this has
 * to catch is a scheme that would run on click, and a prefix test does that.
 */
export function isHttpUrl(value: string | null | undefined): value is string {
  return value != null && /^https?:\/\//i.test(value);
}

/** `#rgb` or `#rrggbb`. Colours reach a `style`, so nothing else goes in one. */
export function safeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? trimmed : null;
}

/** Trimmed text, or null. Anything longer than the cap is a 400, not a slice. */
export function boundedText(
  value: unknown,
  max: number
): { value: string | null } | { tooLong: true } {
  if (typeof value !== "string") return { value: null };
  const trimmed = value.trim();
  if (trimmed.length > max) return { tooLong: true };
  return { value: trimmed || null };
}
