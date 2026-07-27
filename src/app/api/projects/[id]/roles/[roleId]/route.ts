import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { LIMITS } from "@/lib/sanitize";
import { NextRequest, NextResponse } from "next/server";

/** 404 rather than 403, same as everywhere else — don't confirm it exists. */
const notFound = () =>
  NextResponse.json({ error: "Role not found" }, { status: 404 });

/** The role has to belong to a project this user owns. */
async function ownedRole(userId: string, projectId: string, roleId: string) {
  return prisma.projectRole.findFirst({
    where: { id: roleId, projectId, project: { userId } },
  });
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/roles/[roleId]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id, roleId } = await ctx.params;
  const body = await request.json();

  const role = await ownedRole(user.id, id, roleId);
  if (!role) return notFound();

  // Admins run the project, so their own visibility isn't theirs to give up —
  // it would leave the project with nobody able to change these settings.
  if (role.isAdmin) {
    return NextResponse.json(
      { error: "Admins always see everything" },
      { status: 400 }
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name !== undefined && name.length > LIMITS.roleName) {
    return NextResponse.json(
      { error: `A role name is ${LIMITS.roleName} characters or fewer` },
      { status: 400 }
    );
  }
  if (name === "") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (name && name !== role.name) {
    const taken = await prisma.projectRole.findFirst({
      where: { projectId: id, name },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json(
        { error: `This project already has a “${name}” role` },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.projectRole.update({
    where: { id: roleId },
    data: {
      name,
      canViewTimeline:
        typeof body.canViewTimeline === "boolean"
          ? body.canViewTimeline
          : undefined,
      canViewTracker:
        typeof body.canViewTracker === "boolean"
          ? body.canViewTracker
          : undefined,
      canViewTeam:
        typeof body.canViewTeam === "boolean" ? body.canViewTeam : undefined,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/roles/[roleId]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id, roleId } = await ctx.params;

  const role = await ownedRole(user.id, id, roleId);
  if (!role) return notFound();
  if (role.isAdmin) {
    return NextResponse.json(
      { error: "The admin role can't be removed" },
      { status: 400 }
    );
  }

  await prisma.projectRole.delete({ where: { id: roleId } });
  return NextResponse.json({ ok: true });
}
