import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { freshInvite } from "@/lib/invite";
import { MEMBER_FIELDS, memberPayload } from "@/lib/member-select";
import { NextRequest, NextResponse } from "next/server";

/**
 * The invite link for one person on one project. It is made when they are put
 * on the project; this is where it gets replaced or killed.
 *
 *   POST   — a fresh token, which is what makes the previous link dead
 *   DELETE — revokes the link, leaving nobody able to use it
 *
 * Both are the project owner's to do.
 */
async function member(projectId: string, developerId: string, userId: string) {
  if (!developerId) return null;
  return prisma.projectMember.findFirst({
    where: { projectId, developerId, project: { userId } },
    select: { id: true, _count: { select: { roles: true } } },
  });
}

async function developerIdFrom(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return typeof body.developerId === "string" ? body.developerId : "";
}

const notOnProject = () =>
  NextResponse.json({ error: "They are not on this project" }, { status: 404 });

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/invites">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const developerId = await developerIdFrom(request);
  const found = await member(id, developerId, user.id);
  if (!found) return notOnProject();
  // What the link opens is the roles behind it, so there has to be one.
  if (found._count.roles === 0) {
    return NextResponse.json(
      { error: "Give them a role on this project first" },
      { status: 400 }
    );
  }

  const updated = await prisma.projectMember.update({
    where: { id: found.id },
    // A new link is a live one for three days, however the last one ended.
    data: freshInvite(),
    select: MEMBER_FIELDS,
  });
  return NextResponse.json(memberPayload(updated));
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/invites">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const developerId = await developerIdFrom(request);
  const found = await member(id, developerId, user.id);
  if (!found) return notOnProject();

  // The token goes with the revocation: a link nobody can use is a link nobody
  // needs to keep. What stays is the record that there was one.
  const updated = await prisma.projectMember.update({
    where: { id: found.id },
    data: { inviteToken: null, inviteRevoked: true },
    select: MEMBER_FIELDS,
  });
  return NextResponse.json(memberPayload(updated));
}
