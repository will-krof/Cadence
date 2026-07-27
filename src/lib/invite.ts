import { randomBytes } from "node:crypto";

/** The cookie an accepted invite leaves behind. */
export const INVITE_COOKIE = "cadence_invite";

const INVITE_DAYS = 365;

export const INVITE_MAX_AGE = INVITE_DAYS * 24 * 60 * 60;

/**
 * 32 bytes of randomness, url-safe. Long enough that guessing one is not a
 * threat model, short enough to paste into a chat message.
 */
export function newInviteToken() {
  return randomBytes(24).toString("base64url");
}

/** The path an invite link points at. Callers put the origin in front. */
export function invitePath(token: string) {
  return `/invite/${token}`;
}
