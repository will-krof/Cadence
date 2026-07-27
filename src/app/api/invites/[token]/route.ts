import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { INVITE_COOKIE, INVITE_MAX_AGE } from "@/lib/invite";
import { NextRequest, NextResponse } from "next/server";

/**
 * Taking up an invite. The cookie holds the token itself, so a rotated or
 * revoked link stops working on the very next request — there is no session to
 * outlive it.
 */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/invites/[token]">
) {
  const { token } = await ctx.params;

  const member = await prisma.projectMember.findFirst({
    where: { inviteToken: token, inviteRevoked: false },
    select: {
      id: true,
      project: { select: { id: true, name: true } },
      developer: { select: { name: true, active: true } },
    },
  });
  if (!member || !member.developer.active) {
    return NextResponse.json(
      { error: "This invite link is no longer valid" },
      { status: 404 }
    );
  }

  // First use is worth knowing: an unused link is one that never arrived.
  await prisma.projectMember.updateMany({
    where: { id: member.id, inviteUsedAt: null },
    data: { inviteUsedAt: new Date() },
  });

  const store = await cookies();
  store.set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INVITE_MAX_AGE,
  });

  return NextResponse.json({
    project: member.project,
    name: member.developer.name,
  });
}
