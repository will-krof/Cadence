import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/viewer";
import { noteOwner, titleOf } from "@/lib/note-owner";
import { badRequest } from "@/lib/responses";
import { LIMITS } from "@/lib/sanitize";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest, NextResponse } from "next/server";

/** A pile this deep is a wiki, and the project already has one of those. */
const MAX_NOTES = 200;

/**
 * The list: every note the person asking wrote, in the order they arranged
 * them, as titles and the first line or two. The writing itself arrives a note
 * at a time — the list is for finding one, not for reading them all.
 *
 * The order is theirs rather than the clock's. Newest-touched-first sounds
 * right until you use it: opening a note to read it moves it to the top, and
 * the one you always want there sinks. Notes written before the pile could be
 * arranged all sit at the same place, so the time they were last touched still
 * settles them among each other.
 */
export async function GET(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const notes = await prisma.note.findMany({
    where: noteOwner(viewer),
    select: { id: true, title: true, content: true, updatedAt: true },
    orderBy: [{ order: "asc" }, { updatedAt: "desc" }],
  });

  // The snippet is cut here rather than sent whole: a hundred notes of a
  // thousand words each is a megabyte of writing nobody asked to read.
  return jsonResponse(
    request,
    notes.map(({ content, ...note }) => ({
      ...note,
      snippet: snippetOf(content, note.title),
    }))
  );
}

/** What the list shows under the title: the writing past the first line. */
function snippetOf(content: string, title: string) {
  const rest = content.slice(content.indexOf(title) + title.length);
  return rest.replace(/[#*_`>~-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export async function POST(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content : "";
  if (content.length > LIMITS.note) {
    return badRequest(`A note is ${LIMITS.note.toLocaleString()} characters or fewer`);
  }

  const owner = noteOwner(viewer);
  const kept = await prisma.note.count({ where: owner });
  if (kept >= MAX_NOTES) {
    return badRequest(`You can keep ${MAX_NOTES} notes at a time`);
  }

  // A new note lands at the top of the pile, which is where you were looking
  // when you asked for one. Above whatever is currently first rather than at
  // zero, so it doesn't tie with a note already sitting there.
  const first = await prisma.note.findFirst({
    where: owner,
    orderBy: { order: "asc" },
    select: { order: true },
  });

  const note = await prisma.note.create({
    data: {
      ...owner,
      content,
      title: titleOf(content),
      order: (first?.order ?? 0) - 1,
    },
    select: { id: true, title: true, content: true, updatedAt: true },
  });
  return NextResponse.json(note, { status: 201 });
}
