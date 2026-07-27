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
    select: { id: true },
  });
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/wiki/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  if (!(await ownedPage(user.id, id))) return notFound();

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

  const page = await prisma.wikiPage.update({
    where: { id },
    data: {
      title: body.title === undefined ? undefined : titled.value ?? undefined,
      content,
    },
    select: {
      id: true,
      projectId: true,
      title: true,
      content: true,
      order: true,
      updatedAt: true,
    },
  });
  return NextResponse.json(page);
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
