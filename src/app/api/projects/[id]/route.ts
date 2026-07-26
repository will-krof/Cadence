import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]">
) {
  const { id } = await ctx.params;
  const body = await request.json();

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
  const { id } = await ctx.params;
  // Tasks and the sprint cascade with the project.
  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
