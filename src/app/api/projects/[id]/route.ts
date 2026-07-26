import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { NextRequest, NextResponse } from "next/server";

/** 404 rather than 403 for someone else's project — don't confirm it exists. */
const notFound = () =>
  NextResponse.json({ error: "Project not found" }, { status: 404 });

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json();

  const owned = await prisma.project.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!owned) return notFound();

  const project = await prisma.project.update({
    where: { id },
    data: {
      name: typeof body.name === "string" ? body.name.trim() : undefined,
      description:
        body.description === undefined
          ? undefined
          : body.description?.trim() || null,
      hasTimeline:
        typeof body.hasTimeline === "boolean" ? body.hasTimeline : undefined,
      hasTracker:
        typeof body.hasTracker === "boolean" ? body.hasTracker : undefined,
    },
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
  if (deleted.count === 0) return notFound();

  return NextResponse.json({ ok: true });
}
