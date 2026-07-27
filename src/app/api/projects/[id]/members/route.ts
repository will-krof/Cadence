import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
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
  const body = await request.json();
  const developerId =
    typeof body.developerId === "string" ? body.developerId : "";
  const asked: unknown[] = Array.isArray(body.roleIds) ? body.roleIds : [];
  const roleIds = [
    ...new Set(asked.filter((r): r is string => typeof r === "string")),
  ];

  if (!developerId) {
    return NextResponse.json(
      { error: "developerId is required" },
      { status: 400 }
    );
  }

  // Project, person and roles all have to belong to the caller.
  const [project, developer] = await Promise.all([
    prisma.project.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    }),
    prisma.developer.findFirst({
      where: { id: developerId, userId: user.id },
      select: { id: true },
    }),
  ]);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!developer) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  if (roleIds.length > 0) {
    const known = await prisma.projectRole.count({
      where: { id: { in: roleIds }, projectId: id },
    });
    if (known !== roleIds.length) {
      return NextResponse.json(
        { error: "That role is not on this project" },
        { status: 404 }
      );
    }
  }

  const member = await prisma.projectMember.upsert({
    where: { projectId_developerId: { projectId: id, developerId } },
    create: {
      projectId: id,
      developerId,
      roles: { create: roleIds.map((roleId) => ({ roleId })) },
    },
    // Replacing the set outright keeps this the single description of what
    // they hold, rather than something callers have to diff.
    update: {
      roles: {
        deleteMany: {},
        create: roleIds.map((roleId) => ({ roleId })),
      },
    },
    select: {
      projectId: true,
      developerId: true,
      roles: { select: { roleId: true } },
    },
  });

  return NextResponse.json({
    projectId: member.projectId,
    developerId: member.developerId,
    roleIds: member.roles.map((r) => r.roleId),
  });
}

/** Takes someone off the project. Their tasks are untouched. */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/members">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json();
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
