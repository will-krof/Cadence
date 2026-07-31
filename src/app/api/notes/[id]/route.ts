import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/viewer";
import { noteOwner, titleOf } from "@/lib/note-owner";
import { badRequest, done, notFound } from "@/lib/responses";
import { LIMITS } from "@/lib/sanitize";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest, NextResponse } from "next/server";

/**
 * One note, with what is written on it.
 *
 * Every one of these is scoped to whoever is asking, in the same clause that
 * finds the row: there is no "read this note, then check whose it is", so
 * there is no order of operations to get wrong. Somebody else's id answers 404
 * — which is also all it should ever be told.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/notes/[id]">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const { id } = await ctx.params;
  const note = await prisma.note.findFirst({
    where: { id, ...noteOwner(viewer) },
    select: {
      id: true,
      title: true,
      content: true,
      pinned: true,
      updatedAt: true,
    },
  });
  if (!note) return notFound("Note");

  return jsonResponse(request, note);
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/notes/[id]">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  // Two things can be said about a note, and either on its own: what is written
  // on it, and whether it is held at the top of the pile. Pinning one shouldn't
  // have to send the writing back with it.
  const data: {
    content?: string;
    title?: string;
    pinned?: boolean;
  } = {};

  if (body.content !== undefined) {
    if (typeof body.content !== "string") return badRequest("Nothing to write");
    if (body.content.length > LIMITS.note) {
      return badRequest(
        `A note is ${LIMITS.note.toLocaleString()} characters or fewer`
      );
    }
    data.content = body.content;
    data.title = titleOf(body.content);
  }

  if (typeof body.pinned === "boolean") data.pinned = body.pinned;

  if (Object.keys(data).length === 0) return badRequest("Nothing to write");

  // updateMany rather than update: the owner clause belongs in the where, and
  // update() insists on a unique one.
  const written = await prisma.note.updateMany({
    where: { id, ...noteOwner(viewer) },
    data,
  });
  if (written.count === 0) return notFound("Note");

  const note = await prisma.note.findFirst({
    where: { id, ...noteOwner(viewer) },
    select: {
      id: true,
      title: true,
      content: true,
      pinned: true,
      updatedAt: true,
    },
  });
  return NextResponse.json(note);
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/notes/[id]">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const { id } = await ctx.params;
  const gone = await prisma.note.deleteMany({
    where: { id, ...noteOwner(viewer) },
  });
  if (gone.count === 0) return notFound("Note");
  return done();
}
