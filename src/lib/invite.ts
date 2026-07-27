import { randomBytes } from "node:crypto";

/**
 * How long an invite link is good for. It is a setup window, not access: past
 * it the link stops working and a fresh one takes its place, so a link that was
 * never opened never sits around waiting to be found.
 */
export const INVITE_DAYS = 3;

const DAY = 24 * 60 * 60 * 1000;

/**
 * 24 bytes of randomness, url-safe. Long enough that guessing one is not a
 * threat model, short enough to paste into a chat message.
 */
function newInviteToken() {
  return randomBytes(24).toString("base64url");
}

/** When a link made now runs out. */
function inviteExpiry(from = new Date()) {
  return new Date(from.getTime() + INVITE_DAYS * DAY);
}

/** The fields that make a link a live one, for a fresh or replaced invite. */
export function freshInvite() {
  const now = new Date();
  return {
    inviteToken: newInviteToken(),
    inviteCreatedAt: now,
    inviteExpiresAt: inviteExpiry(now),
    inviteRevoked: false,
    inviteUsedAt: null,
  };
}

export function inviteHasExpired(expiresAt: Date | null | undefined) {
  return expiresAt != null && expiresAt.getTime() <= Date.now();
}
