import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">
) {
  const { id } = await ctx.params;
  const body = await request.json();

  const task = await prisma.task.update({
    where: { id },
    data: {
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      description:
        body.description === undefined
          ? undefined
          : body.description?.trim() || null,
      link: body.link === undefined ? undefined : body.link?.trim() || null,
      status: body.status || undefined,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      developerId:
        body.developerId === undefined ? undefined : body.developerId || null,
      order: typeof body.order === "number" ? body.order : undefined,
    },
    include: { developer: true },
  });
  return NextResponse.json(task);
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">
) {
  const { id } = await ctx.params;
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
