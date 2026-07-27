import { prisma } from "@/lib/prisma";
import { boardFilter, workspaceOwnerId } from "@/lib/api-auth";
import { memberDenied, requireViewer } from "@/lib/viewer";
import { TASK_FIELDS } from "@/lib/task-select";
import { parseTask } from "@/lib/task-input";
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
  // role's say on whether a member may touch tasks at all.
  if (memberDenied(viewer, null)) return forbidden();

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const parsed = parseTask(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const reachable = await prisma.task.findFirst({
    where: { id, ...boardFilter(viewer) },
    select: { id: true, projectId: true },
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

  // Moving a task between sprints stays inside its own project.
  if (body.sprintId) {
    const sprint = await prisma.sprint.findFirst({
      where: { id: body.sprintId, projectId: reachable.projectId },
      select: { id: true },
    });
    if (!sprint) {
      return NextResponse.json(
        { error: "That sprint is not on this project" },
        { status: 404 }
      );
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...parsed.data,
      developerId:
        body.developerId === undefined ? undefined : body.developerId || null,
      sprintId: body.sprintId === undefined ? undefined : body.sprintId || null,
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
  if (memberDenied(viewer, null)) return forbidden();

  const { id } = await ctx.params;

  const deleted = await prisma.task.deleteMany({
    where: { id, ...boardFilter(viewer) },
  });
  if (deleted.count === 0) return notFound();

  return NextResponse.json({ ok: true });
}
