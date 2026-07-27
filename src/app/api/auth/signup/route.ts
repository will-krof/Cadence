import { prisma } from "@/lib/prisma";
import {
  createSession,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  passwordProblem,
} from "@/lib/auth";
import { boundedText, LIMITS } from "@/lib/sanitize";
import { rateLimited, SIGNUP_LIMIT } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

/**
 * Signing up for a workspace of your own. The account it makes is an admin —
 * of its own workspace and nothing else: its projects, its roster, its invite
 * links. There is no field here for asking to be anything more, and the role a
 * new account gets is written by this route rather than taken from the body.
 */
export async function POST(request: NextRequest) {
  // Signing up is cheap for us and cheaper for a script, so an address gets a
  // handful of accounts an hour rather than as many as it likes.
  const limited = rateLimited(request, "signup", SIGNUP_LIMIT);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const named = boundedText(body.name, LIMITS.name);

  if (email.length > LIMITS.email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }
  if ("tooLong" in named) {
    return NextResponse.json(
      { error: `A name is ${LIMITS.name} characters or fewer` },
      { status: 400 }
    );
  }
  if (password.length > LIMITS.password) {
    return NextResponse.json(
      { error: `Password must be ${LIMITS.password} characters or fewer` },
      { status: 400 }
    );
  }
  const weak = passwordProblem(password);
  if (weak) return NextResponse.json({ error: weak }, { status: 400 });
  // A password that is the email, or mostly the email, is the first thing
  // anybody would try. A name that merely appears inside a longer password is
  // somebody else's business, so the rule stops where guessing gets hard.
  const local = email.split("@")[0];
  const lowered = password.toLowerCase();
  if (
    lowered === email ||
    lowered === local ||
    (lowered.includes(local) && local.length * 2 >= password.length)
  ) {
    return NextResponse.json(
      { error: "Your password can’t be your email address" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  try {
    const user = await prisma.user.create({
      data: {
        email,
        name: named.value,
        passwordHash: await hashPassword(password),
        // Written here, never read from the request.
        role: "ADMIN",
      },
      select: { id: true, email: true, name: true },
    });

    await createSession(user.id);
    return NextResponse.json({ kind: "owner", ...user }, { status: 201 });
  } catch {
    // Two people claiming the same address at the same moment: the unique index
    // decides, and the loser is told what the check above would have told them.
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }
}
