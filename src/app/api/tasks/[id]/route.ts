import { prisma } from "@/lib/prisma";
import { boardWriteFilter, workspaceOwnerId } from "@/lib/api-auth";
import { memberDenied, requireViewer, viewerName } from "@/lib/viewer";
import { TASK_FIELDS, taskPayload } from "@/lib/task-select";
import { parseTask } from "@/lib/task-input";
import { blockerProblem, parseBlockers, setBlockers } from "@/lib/task-deps";
import { assigneeRows, parseAssignees } from "@/lib/assignees";
import { parseTagIds } from "@/lib/task-tags";
import { badRequest, done, forbidden, notFound } from "@/lib/responses";
import { UNSORTED_LABEL } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;
  // Whether a member may change work anywhere at all. Which project this task
  // is in is the lookup's question, and it asks it with the *writing* scope:
  // being allowed to run one project's board is not being allowed to rewrite
  // another one you can only watch.
  if (memberDenied(viewer, null)) return forbidden();

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const parsed = parseTask(body);
  if ("error" in parsed) return badRequest(parsed.error);
  const waiting = parseBlockers(body.blockedBy);
  if (waiting.error) return badRequest(waiting.error);

  const reachable = await prisma.task.findFirst({
    where: { id, ...boardWriteFilter(viewer) },
    select: {
      id: true,
      projectId: true,
      parentId: true,
      columnId: true,
      // What it is standing in now, so a move can be written into the history
      // as the move it is rather than as a state.
      column: { select: { id: true, name: true } },
    },
  });
  if (!reachable) return notFound("Task");

  // Moving it between columns, which stays inside its own project's board.
  // Null is a real answer: work can be taken out of every column and left
  // unsorted, which is where the tasks of a deleted column end up too.
  let moved: { id: string; name: string } | null = null;
  if (parsed.data.columnId) {
    moved = await prisma.projectColumn.findFirst({
      where: { id: parsed.data.columnId, projectId: reachable.projectId },
      select: { id: true, name: true },
    });
    if (!moved) return notFound("That column is not on this project —");
  }

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

  // The labels the request puts on it, when it mentions them at all, and only
  // ones this project keeps.
  const tagIds = body.tagIds === undefined ? null : parseTagIds(body.tagIds);
  if (tagIds && tagIds.length > 0) {
    const known = await prisma.projectTag.count({
      where: { id: { in: tagIds }, projectId: reachable.projectId },
    });
    if (known !== tagIds.length) return notFound("Tag");
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
      ...(tagIds
        ? { tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) } }
        : {}),
      sprintId: body.sprintId === undefined ? undefined : body.sprintId || null,
      parentId,
    },
    select: TASK_FIELDS,
  });
  const task = taskPayload(updated);

  // A task's history is written as it happens: this is the only place a task
  // moves between columns, so it is the only place that has to remember it.
  // Both names are written beside the ids — a line has to keep reading after
  // either column is renamed or deleted.
  if (
    parsed.data.columnId !== undefined &&
    (parsed.data.columnId ?? null) !== reachable.columnId
  ) {
    await prisma.taskEvent.create({
      data: {
        taskId: id,
        columnId: moved?.id ?? null,
        columnName: moved?.name ?? UNSORTED_LABEL,
        fromId: reachable.column?.id ?? null,
        fromName: reachable.column?.name ?? UNSORTED_LABEL,
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
    where: { id, ...boardWriteFilter(viewer) },
  });
  if (deleted.count === 0) return notFound("Task");

  return done();
}
