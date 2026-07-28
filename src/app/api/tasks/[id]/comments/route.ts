import { prisma } from "@/lib/prisma";
import { boardFilter } from "@/lib/api-auth";
import { requireViewer, viewerName } from "@/lib/viewer";
import {
  COMMENT_FIELDS,
  commentPayload,
  MAX_COMMENT_LENGTH,
} from "@/lib/task-comments";
import { badRequest, notFound } from "@/lib/responses";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest, NextResponse } from "next/server";

/**
 * What has been said about one task, oldest first. Reaching it asks only that
 * the viewer can open the board the task is on — `boardFilter` is the filter the
 * history reads through too, so a role given a board to watch reads the
 * conversation on it as well.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]/comments">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const { id } = await ctx.params;
  const task = await prisma.task.findFirst({
    where: { id, ...boardFilter(viewer) },
    select: { id: true },
  });
  if (!task) return notFound("Task");

  const comments = await prisma.taskComment.findMany({
    where: { taskId: id },
    select: COMMENT_FIELDS,
    orderBy: { createdAt: "asc" },
  });
  return jsonResponse(
    request,
    comments.map((comment) => commentPayload(viewer, comment))
  );
}

/**
 * Saying something about a task. Deliberately not behind the edit flags: a role
 * given a board to watch can still tell the people working on it what it sees,
 * and a comment changes nothing about the work itself.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]/comments">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const { id } = await ctx.params;
  const raw = await request.json().catch(() => ({}));
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!body) return badRequest("A comment needs something in it");
  if (body.length > MAX_COMMENT_LENGTH) {
    return badRequest(
      `A comment can’t be longer than ${MAX_COMMENT_LENGTH} characters`
    );
  }

  const task = await prisma.task.findFirst({
    where: { id, ...boardFilter(viewer) },
    select: { id: true },
  });
  if (!task) return notFound("Task");

  const comment = await prisma.taskComment.create({
    data: {
      taskId: id,
      body,
      by: viewerName(viewer),
      byDeveloperId: viewer.kind === "member" ? viewer.developerId : null,
    },
    select: COMMENT_FIELDS,
  });
  return NextResponse.json(commentPayload(viewer, comment));
}
