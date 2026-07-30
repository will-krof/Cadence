import { prisma } from "@/lib/prisma";
import { boardFilter, workspaceOwnerId } from "@/lib/api-auth";
import { memberDenied, requireViewer, viewerName } from "@/lib/viewer";
import { TASK_FIELDS, taskPayload } from "@/lib/task-select";
import { parseTask } from "@/lib/task-input";
import { blockerProblem, parseBlockers, setBlockers } from "@/lib/task-deps";
import { assigneeRows, parseAssignees } from "@/lib/assignees";
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
  const waiting = parseBlockers(body.blockedBy);
  if (waiting.error) return badRequest(waiting.error);

  const reachable = await prisma.task.findFirst({
    where: { id, ...boardFilter(viewer) },
    select: { id: true, projectId: true, parentId: true, status: true },
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

  // Whoever the request puts on the task has to be on the workspace's own
  // roster. A request that says nothing about it leaves the list alone.
  const named = parseAssignees(body.assigneeIds);
  if ("error" in named) return badRequest(named.error);
  const assignees = "unsaid" in named ? null : named.ids;
  if (assignees && assignees.length > 0) {
    const known = await prisma.developer.count({
      where: { id: { in: assignees }, userId: workspaceOwnerId(viewer) },
    });
    if (known !== assignees.length) return notFound("Developer");
  }

  // Moving a task between sprints stays inside its own project.
  if (body.sprintId) {
    const sprint = await prisma.sprint.findFirst({
      where: { id: body.sprintId, projectId: reachable.projectId },
      select: { id: true },
    });
    if (!sprint) return notFound("That sprint is not on this project —");
  }

  // What this task waits on, when the request says so at all. Checked before
  // anything is written: a set that would close a loop is refused whole rather
  // than half-applied.
  if (waiting.blockers) {
    const fault = await blockerProblem(
      reachable.projectId,
      id,
      waiting.blockers
    );
    if (fault) return badRequest(fault);
    await setBlockers(id, waiting.blockers);
  }

  const updated = await prisma.task.update({
    where: { id },
    data: {
      ...parsed.data,
      // The list as sent, whole: the rows it had go, and the ones it names are
      // written in the order they were named.
      ...(assignees
        ? { assignees: { deleteMany: {}, create: assigneeRows(assignees) } }
        : {}),
      sprintId: body.sprintId === undefined ? undefined : body.sprintId || null,
      parentId,
    },
    select: TASK_FIELDS,
  });
  const task = taskPayload(updated);

  // A task's history is written as it happens: this is the only place a status
  // moves, so it is the only place that has to remember it.
  if (parsed.data.status && parsed.data.status !== reachable.status) {
    await prisma.taskEvent.create({
      data: {
        taskId: id,
        status: parsed.data.status,
        from: reachable.status,
        by: viewerName(viewer),
      },
    });
  }

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
