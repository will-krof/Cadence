import { NextRequest, NextResponse } from "next/server";

/**
 * A fixed-window limiter for the endpoints worth guessing at: signing in, and
 * spending an invite link. Held in memory, so it is per server process rather
 * than per cluster — enough to turn a password guessing run into something that
 * takes years, and it costs nothing to run.
 *
 * Keyed by what is being attacked as well as by who is attacking, so one
 * person's failed attempts can't lock everybody else out of the same endpoint.
 */
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Dropping expired windows on write keeps the map from growing forever. */
function sweep(now: number) {
  if (windows.size < 5_000) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimit {
  /** How many tries the window allows. */
  limit: number;
  /** How long the window is, in seconds. */
  windowSeconds: number;
}

/** Ten tries at one account from one address. */
export const LOGIN_LIMIT: RateLimit = { limit: 10, windowSeconds: 15 * 60 };
/**
 * And a looser cap on the address itself, so guessing one password per account
 * across many accounts is no way around the limit above. High enough that a
 * shared address — an office, a VPN — doesn't run into it in normal use.
 */
export const LOGIN_SPRAY_LIMIT: RateLimit = { limit: 60, windowSeconds: 15 * 60 };
/**
 * Tries at one account from anywhere at all.
 *
 * The two limits above are keyed by the caller's address, and the address is
 * read from `x-forwarded-for` — a header the client writes. Behind a proxy that
 * overwrites it that is fine, but deployed without one, a guessing run only has
 * to send a different value each time and neither limit ever counts twice. This
 * one is keyed by nothing but the account being guessed at, so rotating an
 * address doesn't help: the tries against one login are counted together
 * however they arrive.
 *
 * A limit keyed on the victim rather than the attacker can be spent *by* the
 * attacker, so this one does not lock the door — it only refuses wrong
 * passwords. The login route checks the credentials either way and lets a
 * correct one through, so a guessing run gets nowhere while the person whose
 * account is being guessed at can still sign in throughout. See the route.
 */
export const LOGIN_ACCOUNT_LIMIT: RateLimit = { limit: 25, windowSeconds: 15 * 60 };
export const INVITE_LIMIT: RateLimit = { limit: 20, windowSeconds: 60 * 60 };
/** Nobody needs five workspaces in an hour, and a script would want thousands. */
export const SIGNUP_LIMIT: RateLimit = { limit: 5, windowSeconds: 60 * 60 };

/**
 * The caller's address as the proxy in front of us reports it. Behind a proxy
 * this is a header the client can't set for itself; without one it falls back
 * to a shared bucket, which is the safe direction to be wrong in.
 */
function callerKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Counts one attempt. Returns the 429 to send back when the window is spent,
 * or null to carry on.
 */
export function rateLimited(
  request: NextRequest,
  scope: string,
  { limit, windowSeconds }: RateLimit,
  subject = ""
): NextResponse | null {
  const now = Date.now();
  sweep(now);

  const key = `${scope}:${callerKey(request)}:${subject}`;
  const window = windows.get(key);

  if (!window || window.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return null;
  }

  window.count++;
  if (window.count <= limit) return null;

  const retryAfter = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
  return NextResponse.json(
    { error: "Too many attempts. Try again later." },
    { status: 429, headers: { "retry-after": String(retryAfter) } }
  );
}

/**
 * The same counter, keyed on what is being attacked and not on who is asking —
 * so an attacker who can write their own address header gains nothing by
 * changing it. Used for the per-account login limit.
 */
export function rateLimitedBySubject(
  scope: string,
  { limit, windowSeconds }: RateLimit,
  subject: string
): NextResponse | null {
  const now = Date.now();
  sweep(now);

  const key = `${scope}::${subject}`;
  const window = windows.get(key);

  if (!window || window.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return null;
  }

  window.count++;
  if (window.count <= limit) return null;

  const retryAfter = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
  return NextResponse.json(
    { error: "Too many attempts. Try again later." },
    { status: 429, headers: { "retry-after": String(retryAfter) } }
  );
}

/** Forgets the window after a success, so normal use never trips the limit. */
export function clearRateLimit(
  request: NextRequest,
  scope: string,
  subject = ""
) {
  windows.delete(`${scope}:${callerKey(request)}:${subject}`);
}

/** The same, for a window that was keyed on the subject alone. */
export function clearRateLimitBySubject(scope: string, subject: string) {
  windows.delete(`${scope}::${subject}`);
}
