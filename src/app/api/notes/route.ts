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
 * The list: every note the person asking wrote, newest touched first, as
 * titles and the first line or two. The writing itself arrives a note at a
 * time — the list is for finding one, not for reading them all.
 */
export async function GET(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const notes = await prisma.note.findMany({
    where: noteOwner(viewer),
    select: { id: true, title: true, content: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
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

  const note = await prisma.note.create({
    data: { ...owner, content, title: titleOf(content) },
    select: { id: true, title: true, content: true, updatedAt: true },
  });
  return NextResponse.json(note, { status: 201 });
}
