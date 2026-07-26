import { prisma } from "@/lib/prisma";
import { createSession, normalizeEmail, verifyPassword } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  const user = await prisma.user.findUnique({ where: { email } });

  // Same response whether the email is unknown or the password is wrong, so
  // the endpoint can't be used to enumerate registered accounts.
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    return NextResponse.json(
      { error: "Incorrect email or password" },
      { status: 401 }
    );
  }

  await createSession(user.id);

  return NextResponse.json({ id: user.id, email: user.email, name: user.name });
}
