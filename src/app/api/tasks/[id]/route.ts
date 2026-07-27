import { prisma } from "@/lib/prisma";
import { boardFilter, workspaceOwnerId } from "@/lib/api-auth";
import { memberDenied, requireViewer } from "@/lib/viewer";
import { TASK_FIELDS } from "@/lib/task-select";
import { parseTask } from "@/lib/task-input";
import { ownedDeveloper } from "@/lib/owned";
import { badRequest, done, forbidden, notFound } from "@/lib/responses";
import { NextRequest, NextResponse } from "next/server";

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
  if ("error" in parsed) return badRequest(parsed.error);

  const reachable = await prisma.task.findFirst({
    where: { id, ...boardFilter(viewer) },
    select: { id: true, projectId: true, parentId: true },
  });
  if (!reachable) return notFound("Task");

  // Making a task a step of another, or lifting it back out. A task can't be
  // its own parent, can't be filed under one of its own steps, and can't be
  // filed under something that is a step itself.
  let parentId: string | null | undefined;
  if (body.parentId !== undefined) {
    if (!body.parentId) {
      parentId = null;
    } else if (body.parentId === id) {
      return badRequest("A task can’t be a step of itself");
    } else {
      const parent = await prisma.task.findFirst({
        where: { id: body.parentId, projectId: reachable.projectId },
        select: { id: true, parentId: true },
      });
      if (!parent) return notFound("That task is not on this project —");
      if (parent.parentId) {
        return badRequest("A subtask can’t have subtasks of its own");
      }
      const hasSteps = await prisma.task.findFirst({
        where: { parentId: id },
        select: { id: true },
      });
      if (hasSteps) return badRequest("This task has steps of its own");
      parentId = parent.id;
    }
  }

  // Reassignment must stay within the workspace's own roster.
  if (
    body.developerId &&
    !(await ownedDeveloper(workspaceOwnerId(viewer), body.developerId))
  ) {
    return notFound("Developer");
  }

  // Moving a task between sprints stays inside its own project.
  if (body.sprintId) {
    const sprint = await prisma.sprint.findFirst({
      where: { id: body.sprintId, projectId: reachable.projectId },
      select: { id: true },
    });
    if (!sprint) return notFound("That sprint is not on this project —");
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...parsed.data,
      developerId:
        body.developerId === undefined ? undefined : body.developerId || null,
      sprintId: body.sprintId === undefined ? undefined : body.sprintId || null,
      parentId,
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
  if (deleted.count === 0) return notFound("Task");

  return done();
}
