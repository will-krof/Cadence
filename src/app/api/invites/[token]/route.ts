import { prisma } from "@/lib/prisma";
import {
  createMemberSession,
  hashPassword,
  normalizeUsername,
  passwordProblem,
  usernameProblem,
} from "@/lib/auth";
import { freshInvite, inviteHasExpired } from "@/lib/invite";
import { NextRequest, NextResponse } from "next/server";

const dead = () =>
  NextResponse.json(
    { error: "This invite link is no longer valid" },
    { status: 404 }
  );

/**
 * Taking up an invite: the link is spent on picking a username and a password,
 * and from then on that login is how the person gets in. The link itself grants
 * nothing else, which is why it can be a three-day thing.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/invites/[token]">
) {
  const { token } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const username = normalizeUsername(body.username);
  const password = typeof body.password === "string" ? body.password : "";

  const member = await prisma.projectMember.findFirst({
    where: { inviteToken: token, inviteRevoked: false },
    select: {
      id: true,
      inviteExpiresAt: true,
      project: { select: { id: true, name: true } },
      developer: {
        select: { id: true, name: true, active: true, username: true },
      },
    },
  });
  if (!member || !member.developer.active) return dead();

  // A link that has run out is replaced on the spot, so the admin's copy of it
  // is live again by the time they look — the person just needs the new one.
  if (inviteHasExpired(member.inviteExpiresAt)) {
    await prisma.projectMember.update({
      where: { id: member.id },
      data: freshInvite(),
    });
    return NextResponse.json(
      {
        error:
          "This link has expired. A new one has been made — ask for it and try again.",
      },
      { status: 410 }
    );
  }

  // Their login already exists: the link has nothing left to set up, and it is
  // not a way to change somebody's password.
  if (member.developer.username) {
    return NextResponse.json(
      { error: "You already have a login — sign in with it instead." },
      { status: 409 }
    );
  }

  const nameProblem = usernameProblem(username);
  if (nameProblem) {
    return NextResponse.json({ error: nameProblem }, { status: 400 });
  }
  const secretProblem = passwordProblem(password);
  if (secretProblem) {
    return NextResponse.json({ error: secretProblem }, { status: 400 });
  }

  const taken = await prisma.developer.findUnique({
    where: { username },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json(
      { error: "That username is taken — try another" },
      { status: 409 }
    );
  }

  await prisma.developer.update({
    where: { id: member.developer.id },
    data: { username, passwordHash: await hashPassword(password) },
  });
  // The link is spent, and saying when it was taken up is worth keeping.
  await prisma.projectMember.update({
    where: { id: member.id },
    data: { inviteUsedAt: new Date() },
  });

  await createMemberSession(member.developer.id);

  return NextResponse.json({
    project: member.project,
    name: member.developer.name,
    username,
  });
}
