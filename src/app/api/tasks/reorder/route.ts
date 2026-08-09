import { prisma } from "@/lib/prisma";
import { boardWriteFilter } from "@/lib/api-auth";
import { memberDenied, requireViewer } from "@/lib/viewer";
import { badRequest, done, forbidden } from "@/lib/responses";
import { NextRequest } from "next/server";

/**
 * The order a project's tasks are listed in, rewritten in one go.
 *
 * Dragging a row moves a task and everything under it, so a single move can
 * renumber the whole list — one request and one transaction rather than a
 * request per row, and nothing half-applied if part of it is refused.
 *
 * Only tasks this viewer may already move are written; anything else in the
 * list is ignored rather than argued with, which is the same answer they would
 * get for it one at a time.
 */
const MAX_ROWS = 2_000;

export async function POST(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;
  if (memberDenied(viewer, null)) return forbidden();

  const body = await request.json().catch(() => ({}));
  const asked: unknown[] = Array.isArray(body.order) ? body.order : [];
  if (asked.length === 0) return badRequest("Nothing to reorder");
  if (asked.length > MAX_ROWS) return badRequest("That is too many rows");

  const rows: { id: string; order: number }[] = [];
  for (const row of asked) {
    if (!row || typeof row !== "object") continue;
    const { id, order } = row as { id?: unknown; order?: unknown };
    if (typeof id !== "string") continue;
    const at = Number(order);
    if (!Number.isFinite(at)) continue;
    rows.push({ id, order: Math.max(0, Math.min(1_000_000, Math.round(at))) });
  }
  if (rows.length === 0) return badRequest("Nothing to reorder");

  // Which of them the viewer may move at all — the projects whose boards they
  // may *change*, not the wider set they may look at.
  const allowed = await prisma.task.findMany({
    where: { id: { in: rows.map((r) => r.id) }, ...boardWriteFilter(viewer) },
    select: { id: true },
  });
  const mine = new Set(allowed.map((t) => t.id));

  await prisma.$transaction(
    rows
      .filter((row) => mine.has(row.id))
      .map((row) =>
        prisma.task.update({
          where: { id: row.id },
          data: { order: row.order },
        })
      )
  );

  return done();
}
