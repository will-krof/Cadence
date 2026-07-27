import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { boundedText, LIMITS } from "@/lib/sanitize";
import { NextRequest, NextResponse } from "next/server";

const notFound = () =>
  NextResponse.json({ error: "Page not found" }, { status: 404 });

/** The page has to sit in a project this account owns. */
async function ownedPage(userId: string, id: string) {
  return prisma.wikiPage.findFirst({
    where: { id, project: { userId } },
    select: { id: true, projectId: true, parentId: true },
  });
}

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

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/wiki/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const page = await ownedPage(user.id, id);
  if (!page) return notFound();

  const body = await request.json().catch(() => ({}));

  const titled = boundedText(body.title, LIMITS.title);
  if ("tooLong" in titled) {
    return NextResponse.json({ error: "That title is too long" }, { status: 400 });
  }
  if (body.title !== undefined && !titled.value) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // The body is the one long field in the app, and it is stored as typed: no
  // markup is rendered from it, so there is nothing in it to sanitise.
  let content: string | undefined;
  if (body.content !== undefined) {
    if (typeof body.content !== "string") {
      return NextResponse.json({ error: "Invalid content" }, { status: 400 });
    }
    if (body.content.length > LIMITS.wiki) {
      return NextResponse.json(
        { error: `A page is ${LIMITS.wiki.toLocaleString()} characters or fewer` },
        { status: 400 }
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
      if (!parent) {
        return NextResponse.json(
          { error: "That section is not in this wiki" },
          { status: 404 }
        );
      }
      if (await wouldLoop(id, parent.id)) {
        return NextResponse.json(
          { error: "A section can’t be filed inside itself" },
          { status: 400 }
        );
      }
      parentId = parent.id;
    }
  }

  let order: number | undefined;
  if (body.order !== undefined) {
    const asked = Number(body.order);
    if (!Number.isFinite(asked)) {
      return NextResponse.json({ error: "Invalid position" }, { status: 400 });
    }
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
    select: {
      id: true,
      projectId: true,
      title: true,
      content: true,
      order: true,
      parentId: true,
      updatedAt: true,
    },
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
  if (!(await ownedPage(user.id, id))) return notFound();

  await prisma.wikiPage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
