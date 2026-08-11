import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { ownedColumn } from "@/lib/owned";
import { badRequest, conflict, notFound } from "@/lib/responses";
import { safeColor } from "@/lib/sanitize";
import { MAX_COLUMN_NAME } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

/** What a column is called, what colour it is, and whether it means finished. */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/columns/[columnId]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id, columnId } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const column = await ownedColumn(user.id, id, columnId);
  if (!column) return notFound("Column");

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name !== undefined && name.length > MAX_COLUMN_NAME) {
    return badRequest(`A column is ${MAX_COLUMN_NAME} characters or fewer`);
  }
  if (name === "") return badRequest("Name is required");
  if (name && name !== column.name) {
    const taken = await prisma.projectColumn.findFirst({
      where: { projectId: id, name },
      select: { id: true },
    });
    if (taken) return conflict(`This board already has a “${name}” column`);
  }

  // A colour is only written when one was sent, and only when it is one.
  let color: string | undefined;
  if (body.color !== undefined) {
    const asked = safeColor(body.color);
    if (!asked) return badRequest("That isn’t a colour");
    color = asked;
  }

  const updated = await prisma.projectColumn.update({
    where: { id: columnId },
    data: {
      name,
      color,
      isDone: body.isDone === undefined ? undefined : body.isDone === true,
    },
  });
  return NextResponse.json(updated);
}

/**
 * Deletes a column outright.
 *
 * A column used to be hideable and nothing more, which was never the thing
 * anybody meant: the state stayed real, its tasks stayed in it, and every
 * picker went on offering it to whoever hadn't hidden it. This takes the column
 * away.
 *
 * The work does not go with it. Tasks standing in the column are let go of
 * rather than deleted — they come back on the board as unsorted, where they can
 * be dragged into a column that still exists. A task is somebody's job; a
 * column is a word on a header, and deleting the word must never quietly delete
 * the job. The lines of history naming it are kept for the same reason: they
 * still say what happened, in the words it happened in.
 */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/columns/[columnId]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id, columnId } = await ctx.params;

  const column = await ownedColumn(user.id, id, columnId);
  if (!column) return notFound("Column");

  // The schema lets go of the tasks and the history for us — both sides are
  // `SetNull` — so this is one statement, and the count is what the board is
  // told so it can say how much work came back unsorted.
  const stranded = await prisma.task.count({ where: { columnId } });
  await prisma.projectColumn.delete({ where: { id: columnId } });

  return NextResponse.json({ ok: true, unsorted: stranded });
}
