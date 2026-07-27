import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

export const SESSION_COOKIE = "cadence_session";
/** Team members who set a login up through an invite get their own cookie. */
export const MEMBER_SESSION_COOKIE = "cadence_member";
const SESSION_DAYS = 30;
const KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Passwords are stored as `scrypt$<salt-hex>$<key-hex>`. scrypt is memory-hard,
 * so it stays expensive to brute force even on GPUs.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  // Constant-time compare so a wrong password can't be narrowed down by timing.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * The work a password check costs, done against nothing. Called when no account
 * matched, so a failed sign-in takes about as long either way and the timing
 * doesn't say whether the name exists.
 */
export async function burnPasswordTime(password: string) {
  await scrypt(password.slice(0, 200), randomBytes(16), KEY_LENGTH).catch(
    () => {}
  );
}

/** Sessions are looked up by hash, so a database leak can't be replayed. */
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionExpiry() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

async function setSessionCookie(name: string, token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = sessionExpiry();

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  await setSessionCookie(SESSION_COOKIE, token, expiresAt);
}

/** The same, for a team member signing in with the login their invite set up. */
export async function createMemberSession(developerId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = sessionExpiry();

  await prisma.developerSession.create({
    data: { tokenHash: hashToken(token), developerId, expiresAt },
  });

  await setSessionCookie(MEMBER_SESSION_COOKIE, token, expiresAt);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

/** Returns the signed-in user, or null. Expired sessions are cleaned up. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

/** The signed-in team member, or null. Their session dies with their profile. */
export async function getSessionDeveloperId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(MEMBER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.developerSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, developerId: true, expiresAt: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.developerSession
      .delete({ where: { id: session.id } })
      .catch(() => {});
    return null;
  }

  return session.developerId;
}

/** Signing out drops whichever of the two sessions this browser is holding. */
export async function destroySession() {
  const store = await cookies();

  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }
  store.delete(SESSION_COOKIE);

  const memberToken = store.get(MEMBER_SESSION_COOKIE)?.value;
  if (memberToken) {
    await prisma.developerSession
      .deleteMany({ where: { tokenHash: hashToken(memberToken) } })
      .catch(() => {});
  }
  store.delete(MEMBER_SESSION_COOKIE);
}

export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * What a team member may call themselves. Letters, digits, dots, dashes and
 * underscores: enough to type, and nothing that reads as something else.
 */
export function normalizeUsername(username: unknown): string {
  return typeof username === "string" ? username.trim().toLowerCase() : "";
}

export function usernameProblem(username: string): string | null {
  if (username.length < 3) return "Username must be at least 3 characters";
  if (username.length > 32) return "Username must be 32 characters or fewer";
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return "Use letters, digits, dots, dashes or underscores";
  }
  return null;
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}
