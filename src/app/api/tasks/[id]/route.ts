import { prisma } from "@/lib/prisma";
import { projectFilter, workspaceOwnerId } from "@/lib/api-auth";
import { guestDenied, requireViewer } from "@/lib/viewer";
import { TASK_FIELDS } from "@/lib/task-select";
import { NextRequest, NextResponse } from "next/server";

const notFound = () =>
  NextResponse.json({ error: "Task not found" }, { status: 404 });

const forbidden = () =>
  NextResponse.json({ error: "Your role can't do that" }, { status: 403 });

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;
  // Which project the task is in is settled by the lookup below; this is the
  // role's say on whether a guest may touch tasks at all.
  if (guestDenied(viewer, null)) return forbidden();

  const { id } = await ctx.params;
  const body = await request.json();

  const reachable = await prisma.task.findFirst({
    where: { id, ...projectFilter(viewer) },
    select: { id: true },
  });
  if (!reachable) return notFound();

  // Reassignment must stay within the workspace's own roster.
  if (body.developerId) {
    const developer = await prisma.developer.findFirst({
      where: { id: body.developerId, userId: workspaceOwnerId(viewer) },
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
      sprintId: body.sprintId === undefined ? undefined : body.sprintId || null,
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
  const { viewer, response } = await requireViewer();
  if (response) return response;
  if (guestDenied(viewer, null)) return forbidden();

  const { id } = await ctx.params;

  const deleted = await prisma.task.deleteMany({
    where: { id, ...projectFilter(viewer) },
  });
  if (deleted.count === 0) return notFound();

  return NextResponse.json({ ok: true });
}
