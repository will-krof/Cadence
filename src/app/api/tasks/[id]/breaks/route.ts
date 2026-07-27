import { prisma } from "@/lib/prisma";
import { boardFilter } from "@/lib/api-auth";
import { memberDenied, requireViewer } from "@/lib/viewer";
import { badRequest, done, forbidden, notFound } from "@/lib/responses";
import { TASK_FIELDS } from "@/lib/task-select";
import { NextRequest, NextResponse } from "next/server";

/**
 * The stretches a task stood still for.
 *
 *   POST   — pause it, from a day
 *   PATCH  — pick it up again, on a day
 *   DELETE — forget a pause, as though the work never stopped
 *
 * A pause is somebody's account of what happened to the work, so anyone who can
 * move a task on a board can record one. The task always answers whole, because
 * a bar is drawn from its dates and its gaps together.
 */
const MAX_BREAKS = 50;

function day(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The task, if this viewer may move it. */
async function reachable(
  viewer: Parameters<typeof memberDenied>[0],
  id: string
) {
  return prisma.task.findFirst({
    where: { id, ...boardFilter(viewer) },
    select: { id: true, startDate: true, endDate: true },
  });
}

const whole = (id: string) =>
  prisma.task.findUnique({ where: { id }, select: TASK_FIELDS });

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]/breaks">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;
  if (memberDenied(viewer, null)) return forbidden();

  const { id } = await ctx.params;
  const task = await reachable(viewer, id);
  if (!task) return notFound("Task");

  const body = await request.json().catch(() => ({}));
  const startDate = body.startDate === undefined ? new Date() : day(body.startDate);
  if (!startDate) return badRequest("Invalid date");

  // One pause at a time: a task that is already standing still can't stop
  // again, and the open one is what resuming closes.
  const open = await prisma.taskBreak.findFirst({
    where: { taskId: id, endDate: null },
    select: { id: true },
  });
  if (open) return badRequest("This task is already paused");

  const count = await prisma.taskBreak.count({ where: { taskId: id } });
  if (count >= MAX_BREAKS) return badRequest("That is a lot of pauses");

  await prisma.taskBreak.create({ data: { taskId: id, startDate } });
  return NextResponse.json(await whole(id), { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]/breaks">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;
  if (memberDenied(viewer, null)) return forbidden();

  const { id } = await ctx.params;
  const task = await reachable(viewer, id);
  if (!task) return notFound("Task");

  const body = await request.json().catch(() => ({}));
  const endDate = body.endDate === undefined ? new Date() : day(body.endDate);
  if (!endDate) return badRequest("Invalid date");

  const open = await prisma.taskBreak.findFirst({
    where: { taskId: id, endDate: null },
    orderBy: { startDate: "desc" },
    select: { id: true, startDate: true },
  });
  if (!open) return badRequest("This task isn’t paused");

  // Picking work up before it stopped isn't a pause at all — it is a mistake,
  // so the pause goes rather than being stored inside out.
  if (endDate < open.startDate) {
    await prisma.taskBreak.delete({ where: { id: open.id } });
  } else {
    await prisma.taskBreak.update({ where: { id: open.id }, data: { endDate } });
  }
  return NextResponse.json(await whole(id));
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]/breaks">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;
  if (memberDenied(viewer, null)) return forbidden();

  const { id } = await ctx.params;
  if (!(await reachable(viewer, id))) return notFound("Task");

  const body = await request.json().catch(() => ({}));
  const breakId = typeof body.breakId === "string" ? body.breakId : "";
  const deleted = await prisma.taskBreak.deleteMany({
    where: { id: breakId, taskId: id },
  });
  if (deleted.count === 0) return notFound("Pause");

  const task = await whole(id);
  return task ? NextResponse.json(task) : done();
}
