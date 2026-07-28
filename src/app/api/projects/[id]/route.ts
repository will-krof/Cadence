import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { PROJECT_FIELDS } from "@/lib/project-select";
import { parseFlags, parseSpan } from "@/lib/project-input";
import { boundedText, LIMITS } from "@/lib/sanitize";
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

  const span = parseSpan(body);
  if ("error" in span) return badRequest(span.error);

  const current = await prisma.project.findFirst({
    where: { id, userId: user.id },
    select: { startDate: true, endDate: true },
  });
  if (!current) return notFound("Project");

  // A request that moves one end has to make sense against the end already
  // stored, not just against itself — otherwise editing the start alone could
  // leave a project ending before it begins.
  const startDate =
    span.data.startDate === undefined ? current.startDate : span.data.startDate;
  const endDate =
    span.data.endDate === undefined ? current.endDate : span.data.endDate;
  if (startDate && endDate && endDate < startDate) {
    return badRequest("The project can’t end before it starts");
  }

  const project = await prisma.project.update({
    where: { id },
    data: {
      name: named.value ?? undefined,
      description: body.description === undefined ? undefined : described.value,
      ...parseFlags(body),
      ...span.data,
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
