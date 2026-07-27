import { prisma } from "@/lib/prisma";
import {
  createMemberSession,
  createSession,
  normalizeEmail,
  normalizeUsername,
  verifyPassword,
} from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * One door for both kinds of sign-in: a workspace account by email, and a team
 * member by the username their invite link set up. Which one it is falls out of
 * what was typed, so nobody has to be told which form is theirs.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const typed = typeof body.login === "string" ? body.login : body.email;
  const password = typeof body.password === "string" ? body.password : "";

  const email = normalizeEmail(typed);
  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : null;
  if (user && (await verifyPassword(password, user.passwordHash))) {
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
    await createMemberSession(developer.id);
    return NextResponse.json({
      kind: "member",
      id: developer.id,
      name: developer.name,
    });
  }

  // The same answer whichever of the two was meant, and whether the name is
  // unknown or the password wrong: this endpoint can't be used to find out who
  // has a login.
  return NextResponse.json(
    { error: "Incorrect username or password" },
    { status: 401 }
  );
}
