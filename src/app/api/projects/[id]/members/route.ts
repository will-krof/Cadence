import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Puts someone on this project, in one of its roles or in none yet. The role
 * has to be one the project actually has; taking someone off is a DELETE.
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
  const roleId = typeof body.roleId === "string" ? body.roleId : null;

  if (!developerId) {
    return NextResponse.json(
      { error: "developerId is required" },
      { status: 400 }
    );
  }

  // Project, person and role all have to belong to the caller.
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

  if (roleId !== null) {
    const role = await prisma.projectRole.findFirst({
      where: { id: roleId, projectId: id },
      select: { id: true },
    });
    if (!role) {
      return NextResponse.json(
        { error: "That role is not on this project" },
        { status: 404 }
      );
    }
  }

  const member = await prisma.projectMember.upsert({
    where: { projectId_developerId: { projectId: id, developerId } },
    create: { projectId: id, developerId, roleId },
    update: { roleId },
    select: { projectId: true, developerId: true, roleId: true },
  });
  return NextResponse.json(member);
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
