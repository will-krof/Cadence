import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { freshInvite } from "@/lib/invite";
import { LIMITS } from "@/lib/sanitize";
import { ownedDeveloper, ownedProject } from "@/lib/owned";
import { badRequest, notFound } from "@/lib/responses";
import { MEMBER_FIELDS, memberPayload } from "@/lib/member-select";
import { NextRequest, NextResponse } from "next/server";

/**
 * Puts someone on this project in the roles given — none, one, or several. The
 * list replaces whatever they held, and every role has to be one this project
 * actually has. Taking someone off is a DELETE.
 */
export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/members">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const developerId =
    typeof body.developerId === "string" ? body.developerId : "";
  const asked: unknown[] = Array.isArray(body.roleIds) ? body.roleIds : [];
  const roleIds = [
    ...new Set(asked.filter((r): r is string => typeof r === "string")),
  ];

  if (roleIds.length > LIMITS.roleIds) {
    return badRequest("That is more roles than a project has");
  }
  if (!developerId) return badRequest("developerId is required");

  // Project, person and roles all have to belong to the caller.
  const [project, developer] = await Promise.all([
    ownedProject(user.id, id),
    ownedDeveloper(user.id, developerId),
  ]);
  if (!project) return notFound("Project");
  if (!developer) return notFound("Person");

  if (roleIds.length > 0) {
    const known = await prisma.projectRole.count({
      where: { id: { in: roleIds }, projectId: id },
    });
    if (known !== roleIds.length) {
      return notFound("That role is not on this project —");
    }
  }

  // An invite is only worth handing out once there is a role behind it: a link
  // that opens nothing would be a link that says nothing about what the person
  // is here to do. So the roles decide whether there is one.
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_developerId: { projectId: id, developerId } },
    select: {
      inviteToken: true,
      inviteRevoked: true,
      developer: { select: { username: true } },
    },
  });
  const hasLogin = existing?.developer.username != null;

  const invite = (() => {
    // Their own login has replaced the link; nothing here should disturb it.
    if (hasLogin) return {};
    if (roleIds.length === 0) {
      // No role, no way in. Clearing rather than revoking, so giving them a
      // role again reads as a first invite rather than as something undone.
      return existing?.inviteToken
        ? {
            inviteToken: null,
            inviteCreatedAt: null,
            inviteExpiresAt: null,
            inviteRevoked: false,
          }
        : {};
    }
    // A role and no live link: this is the moment they can be invited. A link
    // that is already live is left alone — changing what somebody can see
    // doesn't change how they get in.
    if (!existing?.inviteToken && !existing?.inviteRevoked) return freshInvite();
    return {};
  })();

  const member = await prisma.projectMember.upsert({
    where: { projectId_developerId: { projectId: id, developerId } },
    create: {
      projectId: id,
      developerId,
      roles: { create: roleIds.map((roleId) => ({ roleId })) },
      ...invite,
    },
    // Replacing the set outright keeps this the single description of what
    // they hold, rather than something callers have to diff.
    update: {
      roles: {
        deleteMany: {},
        create: roleIds.map((roleId) => ({ roleId })),
      },
      ...invite,
    },
    select: MEMBER_FIELDS,
  });

  return NextResponse.json(memberPayload(member));
}

/** Takes someone off the project. Their tasks are untouched. */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/members">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const developerId =
    typeof body.developerId === "string" ? body.developerId : "";

  if (!developerId) {
    return NextResponse.json(
      { error: "developerId is required" },
      { status: 400 }
    );
  }

  const removed = await prisma.projectMember.deleteMany({
    where: { projectId: id, developerId, project: { userId: user.id } },
  });
  if (removed.count === 0) {
    return NextResponse.json(
      { error: "They are not on this project" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
