import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { ownedRole } from "@/lib/owned";
import { badRequest, conflict, done, notFound } from "@/lib/responses";
import { LIMITS } from "@/lib/sanitize";
import { NextRequest, NextResponse } from "next/server";

/** The fields that say what a role opens, as against what it is called. */
const VISIBILITY = [
  "canViewTimeline",
  "canEditTimeline",
  "canViewTracker",
  "canEditTracker",
  "canViewTeam",
  "canEditTeam",
  "canViewWiki",
  "canEditWiki",
] as const;

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/roles/[roleId]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id, roleId } = await ctx.params;
  const body = await request.json();

  const role = await ownedRole(user.id, id, roleId);
  if (!role) return notFound("Role");

  // Admins run the project, so their own visibility isn't theirs to give up —
  // it would leave the project with nobody able to change these settings. What
  // the role is *called* is another matter: renaming it changes nothing about
  // what it opens, so that stays allowed.
  const changesVisibility = VISIBILITY.some(
    (key) => typeof body[key] === "boolean"
  );
  if (role.isAdmin && changesVisibility) {
    return badRequest("Admins always see everything");
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name !== undefined && name.length > LIMITS.roleName) {
    return badRequest(`A role name is ${LIMITS.roleName} characters or fewer`);
  }
  if (name === "") return badRequest("Name is required");
  if (name && name !== role.name) {
    const taken = await prisma.projectRole.findFirst({
      where: { projectId: id, name },
      select: { id: true },
    });
    if (taken) return conflict(`This project already has a “${name}” role`);
  }

  const updated = await prisma.projectRole.update({
    where: { id: roleId },
    data: {
      name,
      // Each flag is written only when it was asked about, so a change to one
      // tool can't quietly clear another.
      ...Object.fromEntries(
        VISIBILITY.filter((key) => typeof body[key] === "boolean").map((key) => [
          key,
          body[key] as boolean,
        ])
      ),
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
  if (!role) return notFound("Role");
  if (role.isAdmin) return badRequest("The admin role can't be removed");

  await prisma.projectRole.delete({ where: { id: roleId } });
  return done();
}
