import { prisma } from "@/lib/prisma";
import {
  burnPasswordTime,
  createMemberSession,
  createSession,
  normalizeEmail,
  normalizeUsername,
  verifyPassword,
} from "@/lib/auth";
import { LIMITS } from "@/lib/sanitize";
import {
  clearRateLimit,
  LOGIN_LIMIT,
  LOGIN_SPRAY_LIMIT,
  rateLimited,
} from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const wrong = () =>
  NextResponse.json(
    { error: "Incorrect username or password" },
    { status: 401 }
  );

/**
 * One door for both kinds of sign-in: a workspace account by email, and a team
 * member by the username their invite link set up. Which one it is falls out of
 * what was typed, so nobody has to be told which form is theirs.
 *
 * Guessing is answered three ways: a limited number of tries per address, the
 * same message however the attempt failed, and the same work done whether or
 * not the name exists — so neither the wording nor the timing says who has an
 * account here.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const typed = typeof body.login === "string" ? body.login : body.email;
  const password = typeof body.password === "string" ? body.password : "";

  // Counted per account as well as per address, so hammering one login can't
  // lock everybody behind the same address out of theirs.
  const account = normalizeEmail(typed) || normalizeUsername(typed);
  const limited =
    rateLimited(request, "login", LOGIN_LIMIT, account) ??
    rateLimited(request, "login-spray", LOGIN_SPRAY_LIMIT);
  if (limited) return limited;

  // scrypt is deliberately expensive, which makes an unbounded password an
  // invitation to spend the server's CPU on one request.
  if (password.length > LIMITS.password) return wrong();

  const email = normalizeEmail(typed);
  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : null;
  if (user && (await verifyPassword(password, user.passwordHash))) {
    clearRateLimit(request, "login", account);
    await createSession(user.id);
    return NextResponse.json({
      kind: "owner",
      id: user.id,
      email: user.email,
      name: user.name,
    });
  }

  const username = normalizeUsername(typed);
  const developer = username
    ? await prisma.developer.findUnique({
        where: { username },
        select: { id: true, name: true, active: true, passwordHash: true },
      })
    : null;
  if (
    developer?.active &&
    developer.passwordHash &&
    (await verifyPassword(password, developer.passwordHash))
  ) {
    clearRateLimit(request, "login", account);
    await createMemberSession(developer.id);
    return NextResponse.json({
      kind: "member",
      id: developer.id,
      name: developer.name,
    });
  }

  // Nothing matched. Spend the same time a real check would have, so a reply
  // that comes back quickly isn't a hint that the name is unknown.
  if (!user && !developer?.passwordHash) await burnPasswordTime(password);

  return wrong();
}
