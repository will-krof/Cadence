import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { ownedTag } from "@/lib/owned";
import { badRequest, conflict, done, notFound } from "@/lib/responses";
import { LIMITS, safeColor } from "@/lib/sanitize";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/tags/[tagId]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id, tagId } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const tag = await ownedTag(user.id, id, tagId);
  if (!tag) return notFound("Tag");

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name !== undefined && name.length > LIMITS.tagName) {
    return badRequest(`A tag is ${LIMITS.tagName} characters or fewer`);
  }
  if (name === "") return badRequest("Name is required");
  if (name && name !== tag.name) {
    const taken = await prisma.projectTag.findFirst({
      where: { projectId: id, name },
      select: { id: true },
    });
    if (taken) return conflict(`This project already has a “${name}” tag`);
  }

  // A colour is only written when one was sent, and only when it is one.
  let color: string | undefined;
  if (body.color !== undefined) {
    const asked = safeColor(body.color);
    if (!asked) return badRequest("That isn’t a colour");
    color = asked;
  }

  const updated = await prisma.projectTag.update({
    where: { id: tagId },
    data: { name, color },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/tags/[tagId]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id, tagId } = await ctx.params;

  const tag = await ownedTag(user.id, id, tagId);
  if (!tag) return notFound("Tag");

  // The rows joining it to tasks go with it: a tag nobody has is a tag
  // nothing wears.
  await prisma.projectTag.delete({ where: { id: tagId } });
  return done();
}
