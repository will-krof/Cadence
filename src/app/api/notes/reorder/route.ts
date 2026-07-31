import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/viewer";
import { noteOwner } from "@/lib/note-owner";
import { badRequest, done } from "@/lib/responses";
import { NextRequest } from "next/server";

/**
 * The order somebody keeps their notes in, rewritten in one go.
 *
 * Dragging one note past another renumbers the pile, so this takes the whole
 * list rather than the one row that moved: one request and one transaction,
 * with nothing half-applied if part of it is refused.
 *
 * Every write is scoped to whoever is asking, in the same clause that finds the
 * row — a note belongs to one person, and somebody else's id simply isn't in
 * the set that gets written.
 */
const MAX_ROWS = 200;

export async function POST(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const asked: unknown[] = Array.isArray(body.order) ? body.order : [];
  if (asked.length === 0) return badRequest("Nothing to reorder");
  if (asked.length > MAX_ROWS) return badRequest("That is too many notes");

  const rows: { id: string; order: number }[] = [];
  for (const row of asked) {
    if (!row || typeof row !== "object") continue;
    const { id, order } = row as { id?: unknown; order?: unknown };
    if (typeof id !== "string") continue;
    const at = Number(order);
    if (!Number.isFinite(at)) continue;
    rows.push({ id, order: Math.max(0, Math.min(MAX_ROWS, Math.round(at))) });
  }
  if (rows.length === 0) return badRequest("Nothing to reorder");

  const owner = noteOwner(viewer);
  await prisma.$transaction(
    rows.map((row) =>
      // updateMany rather than update: the owner clause belongs in the where,
      // and a note that isn't theirs writes nothing rather than answering.
      prisma.note.updateMany({
        where: { id: row.id, ...owner },
        data: { order: row.order },
      })
    )
  );

  return done();
}
