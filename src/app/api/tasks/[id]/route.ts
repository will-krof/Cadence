import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { TASK_FIELDS } from "@/lib/task-select";
import { NextRequest, NextResponse } from "next/server";

const notFound = () =>
  NextResponse.json({ error: "Task not found" }, { status: 404 });

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json();

  const owned = await prisma.task.findFirst({
    where: { id, project: { userId: user.id } },
    select: { id: true },
  });
  if (!owned) return notFound();

  // Reassignment must stay within the caller's own roster.
  if (body.developerId) {
    const developer = await prisma.developer.findFirst({
      where: { id: body.developerId, userId: user.id },
      select: { id: true },
    });
    if (!developer) {
      return NextResponse.json({ error: "Developer not found" }, { status: 404 });
    }
  }

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
    select: TASK_FIELDS,
  });
  return NextResponse.json(task);
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  const deleted = await prisma.task.deleteMany({
    where: { id, project: { userId: user.id } },
  });
  if (deleted.count === 0) return notFound();

  return NextResponse.json({ ok: true });
}
