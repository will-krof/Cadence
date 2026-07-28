import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { PROJECT_FIELDS } from "@/lib/project-select";
import { boundedText, LIMITS } from "@/lib/sanitize";
import { ownedProject } from "@/lib/owned";
import { badRequest, done, notFound } from "@/lib/responses";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const named = boundedText(body.name, LIMITS.name);
  const described = boundedText(body.description, LIMITS.description);
  if ("tooLong" in named || "tooLong" in described) {
    return badRequest("That is too long");
  }

  if (!(await ownedProject(user.id, id))) return notFound("Project");

  const project = await prisma.project.update({
    where: { id },
    data: {
      name: named.value ?? undefined,
      description: body.description === undefined ? undefined : described.value,
      hasTimeline:
        typeof body.hasTimeline === "boolean" ? body.hasTimeline : undefined,
      hasTracker:
        typeof body.hasTracker === "boolean" ? body.hasTracker : undefined,
      hasWiki: typeof body.hasWiki === "boolean" ? body.hasWiki : undefined,
      archived: typeof body.archived === "boolean" ? body.archived : undefined,
    },
    select: PROJECT_FIELDS,
  });
  return NextResponse.json(project);
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  // Tasks and the sprint cascade with the project.
  const deleted = await prisma.project.deleteMany({
    where: { id, userId: user.id },
  });
  if (deleted.count === 0) return notFound("Project");

  return done();
}
