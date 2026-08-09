import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
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
  // may *change*, not the wider set they may look at — and where each one sits
  // now, which is what says whether it has to be written at all.
  const allowed = await prisma.task.findMany({
    where: { id: { in: rows.map((r) => r.id) }, ...boardWriteFilter(viewer) },
    select: { id: true, order: true },
  });
  const at = new Map(allowed.map((t) => [t.id, t.order]));

  // Most of a renumber is rows that were already right: dragging one task down
  // a list of four hundred moves the task and shifts the handful it passed, and
  // the rest are being told the number they already have.
  const moved = rows.filter(
    (row) => at.has(row.id) && at.get(row.id) !== row.order
  );
  if (moved.length === 0) return done();

  // One statement rather than one per row. This was a `$transaction` of an
  // `update` each, so a drag on a four-hundred-row board was four hundred round
  // trips to the database — the single slowest thing the app did, and it
  // happened while somebody was holding a task under the cursor.
  //
  // Written as raw SQL because that is the only way to say "these rows, these
  // numbers" in one go. It is fully parameterised — every id and every number
  // is a bound value, none of it is interpolated into the string — and the ids
  // have already been narrowed to the ones this viewer may move.
  //
  // A side effect worth having: raw SQL doesn't fire Prisma's `@updatedAt`, so
  // dragging one task no longer marks four hundred of them as freshly edited.
  await prisma.$executeRaw`
    UPDATE "Task"
       SET "order" = CASE "id"
         ${Prisma.join(
           moved.map((row) => Prisma.sql`WHEN ${row.id} THEN ${row.order}`),
           " "
         )}
       END
     WHERE "id" IN (${Prisma.join(moved.map((row) => row.id))})
  `;

  return done();
}
