import { prisma } from "@/lib/prisma";
import { boardFilter } from "@/lib/api-auth";
import { requireViewer } from "@/lib/viewer";
import { notFound } from "@/lib/responses";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest } from "next/server";

/**
 * What has happened to one task: every column it was moved to, when, and by
 * whom. The column's name is stored on the line rather than looked up, so the
 * history keeps reading after a column is renamed or deleted.
 *
 * Fetched when a task is opened rather than carried on every board row — a
 * board draws hundreds of tasks and reads the history of none of them.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]/history">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const { id } = await ctx.params;
  const task = await prisma.task.findFirst({
    where: { id, ...boardFilter(viewer) },
    select: { id: true },
  });
  if (!task) return notFound("Task");

  const events = await prisma.taskEvent.findMany({
    where: { taskId: id },
    select: {
      id: true,
      columnId: true,
      columnName: true,
      fromId: true,
      fromName: true,
      by: true,
      at: true,
    },
    orderBy: { at: "asc" },
  });
  return jsonResponse(request, events);
}
