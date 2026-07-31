import { prisma } from "@/lib/prisma";
import { boardFilter, scopedToProject, workspaceOwnerId } from "@/lib/api-auth";
import {
  memberCannotRead,
  memberDenied,
  requireViewer,
  viewerName,
} from "@/lib/viewer";
import { TASK_FIELDS, taskPayload, taskPayloads } from "@/lib/task-select";
import { parseTask } from "@/lib/task-input";
import { blockerProblem, parseBlockers } from "@/lib/task-deps";
import { LIMITS } from "@/lib/sanitize";
import { ownedProject } from "@/lib/owned";
import { assigneeRows, parseAssignees } from "@/lib/assignees";
import { parseTagIds } from "@/lib/task-tags";
import { badRequest, forbidden, notFound } from "@/lib/responses";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest, NextResponse } from "next/server";

/** More steps than this is a task that wanted to be a project. */
const MAX_STEPS = 50;

export async function GET(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const params = request.nextUrl.searchParams;
  const projectId = params.get("projectId");
  if (memberCannotRead(viewer, projectId)) return forbidden();

  // scope=all powers the Team view, which only needs to know who works where —
  // not the tasks themselves.
  if (params.get("scope") === "all") {
    const rows = await prisma.taskAssignee.findMany({
      where: { task: boardFilter(viewer) },
      select: { developerId: true, task: { select: { projectId: true } } },
    });
    // One row per person per project. The pairs are thinned here rather than
    // by the query: a task is shared now, so "distinct" would have to span the
    // join, and the answer is a handful of pairs either way.
    const seen = new Set<string>();
    const assignments: { developerId: string; projectId: string }[] = [];
    for (const row of rows) {
      const pair = `${row.developerId}:${row.task.projectId}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      assignments.push({
        developerId: row.developerId,
        projectId: row.task.projectId,
      });
    }
    return jsonResponse(request, assignments);
  }

  const tasks = await prisma.task.findMany({
    // Scoping through the project relation keeps other workspaces' tasks out
    // even when an arbitrary projectId is supplied. The two clauses are ANDed
    // rather than spread together: a member's scope is keyed on `projectId`
    // too, so spreading let whichever was written second erase the other.
    where: scopedToProject(boardFilter(viewer), projectId),
    // The assignee's profile is left out on purpose: the client already holds
    // the roster, and repeating a profile per task dwarfed the tasks themselves.
    select: TASK_FIELDS,
    orderBy: { order: "asc" },
  });
  return jsonResponse(request, taskPayloads(tasks));
}

export async function POST(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const projectId = typeof body.projectId === "string" ? body.projectId : "";

  const parsed = parseTask(body);
  if ("error" in parsed) return badRequest(parsed.error);
  const waiting = parseBlockers(body.blockedBy);
  if (waiting.error) return badRequest(waiting.error);
  // Dates are not among the things a task needs to exist: work is written down
  // before anybody knows when it runs, and a project that never asks about
  // dates writes none at all. What can't be missing is what it is and where it
  // lives.
  const { title, startDate = null, endDate = null } = parsed.data;
  if (!projectId || !title) {
    return badRequest("projectId and title are required");
  }
  if (memberDenied(viewer, projectId)) return forbidden();

  const ownerId = workspaceOwnerId(viewer);

  if (!(await ownedProject(ownerId, projectId))) return notFound("Project");

  // Whoever is put on it has to come from the workspace's own roster.
  const named = parseAssignees(body.assigneeIds);
  if ("error" in named) return badRequest(named.error);
  const assignees = "unsaid" in named ? [] : named.ids;

  // A task only wears labels its own project keeps.
  const tagIds = parseTagIds(body.tagIds);
  if (tagIds.length > 0) {
    const known = await prisma.projectTag.count({
      where: { id: { in: tagIds }, projectId },
    });
    if (known !== tagIds.length) return notFound("Tag");
  }

  // A task belongs to a sprint of its own project. Without this, an id from
  // somewhere else would file the work under a stranger's sprint.
  if (body.sprintId) {
    const sprint = await prisma.sprint.findFirst({
      where: { id: body.sprintId, projectId },
      select: { id: true },
    });
    if (!sprint) return notFound("That sprint is not on this project —");
  }

  // A subtask is a step of a task on the same project, and only of a task that
  // is not a step itself: the parts of a job are one level down, not a tree.
  let parentId: string | null = null;
  if (body.parentId) {
    const parent = await prisma.task.findFirst({
      where: { id: body.parentId, projectId },
      select: { id: true, parentId: true },
    });
    if (!parent) return notFound("That task is not on this project —");
    if (parent.parentId) {
      return badRequest("A subtask can’t have subtasks of its own");
    }
    parentId = parent.id;
  }

  // What the task is waiting on. Nothing can be looping back to a task that
  // doesn't exist yet, so only the two rules about the ends are in play here.
  const blockers = waiting.blockers ?? [];
  const blockerFault = await blockerProblem(projectId, null, blockers);
  if (blockerFault) return badRequest(blockerFault);

  const maxOrder = await prisma.task.aggregate({
    where: { projectId },
    _max: { order: true },
  });

  // Steps the task is being made with. They are tasks in their own right —
  // same dates, same board, and each with whoever is to do it — so they are
  // written here, in one round trip and one transaction, rather than a request
  // each.
  const steps: { title: string; assignees: string[] }[] = [];
  if (Array.isArray(body.subtasks)) {
    for (const raw of body.subtasks.slice(0, MAX_STEPS)) {
      const step = typeof raw === "string" ? { title: raw } : raw;
      if (!step || typeof step !== "object") continue;
      const title = typeof step.title === "string" ? step.title.trim() : "";
      if (!title) continue;
      if (title.length > LIMITS.title) {
        return badRequest(`A step's title is ${LIMITS.title} characters or fewer`);
      }
      const on = parseAssignees(step.assigneeIds);
      if ("error" in on) return badRequest(on.error);
      steps.push({ title, assignees: "unsaid" in on ? [] : on.ids });
    }
  }

  // Everybody named anywhere in this request — on the task or on one of its
  // steps — has to be on this workspace's roster, and they are all checked in
  // one query rather than one each.
  const people = [
    ...new Set([...assignees, ...steps.flatMap((step) => step.assignees)]),
  ];
  if (people.length > 0) {
    const known = await prisma.developer.count({
      where: { id: { in: people }, userId: ownerId },
    });
    if (known !== people.length) return notFound("Developer");
  }
  if (parentId && steps.length > 0) {
    return badRequest("A subtask can’t have subtasks of its own");
  }

  const from = (maxOrder._max.order ?? 0) + 1;
  const common = {
    startDate,
    endDate,
    projectId,
    sprintId: body.sprintId || null,
  };

  const created = await prisma.task.create({
    data: {
      ...parsed.data,
      ...common,
      title,
      status: parsed.data.status ?? "TODO",
      assignees: { create: assigneeRows(assignees) },
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
      parentId,
      order: from,
      // What it waits on, written with it: a task that arrives already blocked
      // should never be drawn for a moment as though it weren't.
      blockedBy: { create: blockers.map((blockerId) => ({ blockerId })) },
      // The first line of its history is being written down at all.
      events: {
        create: {
          status: parsed.data.status ?? "TODO",
          by: viewerName(viewer),
        },
      },
    },
    select: TASK_FIELDS,
  });
  const task = taskPayload(created);

  if (steps.length === 0) return NextResponse.json(task, { status: 201 });

  await prisma.$transaction(
    steps.map((step, i) =>
      prisma.task.create({
        data: {
          ...common,
          // Whoever was picked beside it, and nobody when nobody was: the
          // form shows that answer, so it is the one that is stored.
          assignees: { create: assigneeRows(step.assignees) },
          title: step.title,
          parentId: task.id,
          order: from + i + 1,
          events: { create: { status: "TODO", by: viewerName(viewer) } },
        },
        select: { id: true },
      })
    )
  );
  const subtasks = await prisma.task.findMany({
    where: { parentId: task.id },
    select: TASK_FIELDS,
    orderBy: { order: "asc" },
  });

  return NextResponse.json(
    { ...task, subtasks: taskPayloads(subtasks) },
    { status: 201 }
  );
}
