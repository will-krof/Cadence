import { prisma } from "@/lib/prisma";
import { requireUser, wikiFilter } from "@/lib/api-auth";
import { requireViewer } from "@/lib/viewer";
import { ownedWikiPage } from "@/lib/owned";
import { badRequest, done, notFound } from "@/lib/responses";
import { boundedText, LIMITS } from "@/lib/sanitize";
import { jsonResponse } from "@/lib/json-response";
import { WIKI_FIELDS } from "@/lib/wiki-select";
import { NextRequest, NextResponse } from "next/server";

/**
 * True when `candidate` is the page itself or somewhere under it. Filing a
 * section inside its own subsection would cut both loose from the wiki and
 * leave a ring of pages nothing points at, so the walk up from the candidate
 * has to clear the page being moved.
 */
async function wouldLoop(pageId: string, candidateId: string) {
  let at: string | null = candidateId;
  // The wiki is a tree, so this terminates at the top; the cap is there for a
  // row that somehow already loops rather than for a deep wiki.
  for (let step = 0; at && step < 100; step++) {
    if (at === pageId) return true;
    const parent: { parentId: string | null } | null =
      await prisma.wikiPage.findUnique({
        where: { id: at },
        select: { parentId: true },
      });
    at = parent?.parentId ?? null;
  }
  return false;
}

/** One page, with what is written on it. Reading follows the project's roles. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/wiki/[id]">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const { id } = await ctx.params;
  const page = await prisma.wikiPage.findFirst({
    where: { id, ...wikiFilter(viewer) },
    select: WIKI_FIELDS,
  });
  if (!page) return notFound("Page");

  return jsonResponse(request, page);
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/wiki/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const page = await ownedWikiPage(user.id, id);
  if (!page) return notFound("Page");

  const body = await request.json().catch(() => ({}));

  const titled = boundedText(body.title, LIMITS.title);
  if ("tooLong" in titled) {
    return badRequest("That title is too long");
  }
  if (body.title !== undefined && !titled.value) {
    return badRequest("Title is required");
  }

  // The body is the one long field in the app, and it is stored as typed: no
  // markup is rendered from it, so there is nothing in it to sanitise.
  let content: string | undefined;
  if (body.content !== undefined) {
    if (typeof body.content !== "string") return badRequest("Invalid content");
    if (body.content.length > LIMITS.wiki) {
      return badRequest(
        `A page is ${LIMITS.wiki.toLocaleString()} characters or fewer`
      );
    }
    content = body.content;
  }

  // Moving a page: into another section, out to the top of the wiki, or to a
  // different place among its siblings. The two travel together — where a page
  // sits is a parent and a position, not one or the other.
  let parentId: string | null | undefined;
  if (body.parentId !== undefined) {
    if (!body.parentId) {
      parentId = null;
    } else {
      const parent = await prisma.wikiPage.findFirst({
        where: { id: body.parentId, projectId: page.projectId },
        select: { id: true },
      });
      if (!parent) return notFound("That section is");
      if (await wouldLoop(id, parent.id)) {
        return badRequest("A section can’t be filed inside itself");
      }
      parentId = parent.id;
    }
  }

  let order: number | undefined;
  if (body.order !== undefined) {
    const asked = Number(body.order);
    if (!Number.isFinite(asked)) return badRequest("Invalid position");
    order = Math.max(0, Math.min(100_000, Math.round(asked)));
  }

  const updated = await prisma.wikiPage.update({
    where: { id },
    data: {
      title: body.title === undefined ? undefined : titled.value ?? undefined,
      content,
      parentId,
      order,
    },
    select: WIKI_FIELDS,
  });

  // Renumber the section it landed in, so the positions the client sent stay
  // whole numbers with no ties — a drag between two pages arrives as a
  // fractional position, and this is where it settles.
  if (parentId !== undefined || order !== undefined) {
    const siblings = await prisma.wikiPage.findMany({
      where: { projectId: page.projectId, parentId: updated.parentId },
      orderBy: [{ order: "asc" }, { updatedAt: "desc" }],
      select: { id: true },
    });
    await prisma.$transaction(
      siblings.map((s, i) =>
        prisma.wikiPage.update({ where: { id: s.id }, data: { order: i * 2 } })
      )
    );
    return NextResponse.json({
      ...updated,
      order: siblings.findIndex((s) => s.id === id) * 2,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/wiki/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  if (!(await ownedWikiPage(user.id, id))) return notFound("Page");

  await prisma.wikiPage.delete({ where: { id } });
  return done();
}
