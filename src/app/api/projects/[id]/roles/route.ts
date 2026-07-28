import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { boundedText, LIMITS } from "@/lib/sanitize";
import { ownedProject } from "@/lib/owned";
import { badRequest, conflict, notFound } from "@/lib/responses";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/roles">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const named = boundedText(body.name, LIMITS.roleName);
  if ("tooLong" in named) {
    return badRequest(`A role name is ${LIMITS.roleName} characters or fewer`);
  }
  const name = named.value;
  if (!name) return badRequest("Name is required");

  if (!(await ownedProject(user.id, id))) return notFound("Project");

  const taken = await prisma.projectRole.findFirst({
    where: { projectId: id, name },
    select: { id: true },
  });
  if (taken) return conflict(`This project already has a “${name}” role`);

  // New roles start with nothing visible, so granting is always deliberate.
  const role = await prisma.projectRole.create({
    data: {
      projectId: id,
      name,
      canViewTimeline: body.canViewTimeline === true,
      canViewTracker: body.canViewTracker === true,
      canEditTimeline: body.canEditTimeline === true,
      canEditTracker: body.canEditTracker === true,
      canViewTeam: body.canViewTeam === true,
      canEditTeam: body.canEditTeam === true,
      canViewWiki: body.canViewWiki === true,
      canEditWiki: body.canEditWiki === true,
    },
  });
  return NextResponse.json(role, { status: 201 });
}
