import { prisma } from "@/lib/prisma";
import { projectScope } from "@/lib/api-auth";
import { memberCannotRead, requireViewer } from "@/lib/viewer";
import { buildReport, WINDOW_DAYS } from "@/lib/reports";
import { jsonResponse } from "@/lib/json-response";
import { forbidden, notFound } from "@/lib/responses";
import { NextRequest } from "next/server";

/**
 * A project's own numbers.
 *
 * Worked out here rather than on the client, for two reasons. The history a
 * cumulative flow chart is built from is far larger than the answer — a board
 * of four hundred tasks has thousands of events, and none of them are worth
 * sending to a browser to be counted there. And the arithmetic is the same
 * arithmetic whoever is asking, so it belongs in one place where it can be
 * read and checked.
 *
 * Who may read it: whoever may open one of the project's boards. Reports are a
 * reading of those boards and say nothing the boards don't — so they are not a
 * permission of their own, and inventing one would be a switch to get wrong.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/reports">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const { id } = await ctx.params;

  const project = await prisma.project.findFirst({
    where: { id, ...projectScope(viewer) },
    select: { id: true, hasReports: true },
  });
  if (!project) return notFound("Project");
  if (memberCannotRead(viewer, id)) return forbidden();

  // Everything the arithmetic reads, in two queries. The events are capped to
  // the window the charts draw plus a little: what happened before it only
  // matters as "where each task already stood", and the tasks themselves say
  // that. Cycle time reaches back further, so the cap is generous rather than
  // exact — it is a guard against a year-old board, not a filter.
  const since = new Date(Date.now() - WINDOW_DAYS * 3 * 24 * 60 * 60 * 1000);

  const [tasks, events, sprints] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: id },
      select: {
        id: true,
        status: true,
        priority: true,
        createdAt: true,
        startDate: true,
        endDate: true,
        estimateMinutes: true,
        sprintId: true,
        parentId: true,
        assignees: { select: { developerId: true } },
        tags: { select: { tagId: true } },
        blockedBy: { select: { blockerId: true } },
      },
    }),
    prisma.taskEvent.findMany({
      where: { task: { projectId: id }, at: { gte: since } },
      select: { taskId: true, status: true, at: true },
      orderBy: { at: "asc" },
    }),
    prisma.sprint.findMany({
      where: { projectId: id },
      select: {
        id: true,
        number: true,
        startDate: true,
        endDate: true,
        archived: true,
      },
    }),
  ]);

  return jsonResponse(request, buildReport({ tasks, events, sprints }));
}
