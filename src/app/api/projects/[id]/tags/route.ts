import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { boundedText, LIMITS, safeColor } from "@/lib/sanitize";
import { ownedProject } from "@/lib/owned";
import { badRequest, conflict, notFound } from "@/lib/responses";
import { NextRequest, NextResponse } from "next/server";

/** More than this is a filing system, not a set of labels. */
const MAX_TAGS = 30;

/** What a new tag is drawn in when the request doesn't say. */
const DEFAULT_TAG_COLOR = "#2a78d6";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/tags">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const named = boundedText(body.name, LIMITS.tagName);
  if ("tooLong" in named) {
    return badRequest(`A tag is ${LIMITS.tagName} characters or fewer`);
  }
  const name = named.value;
  if (!name) return badRequest("Name is required");

  if (!(await ownedProject(user.id, id))) return notFound("Project");

  const [taken, count] = await Promise.all([
    prisma.projectTag.findFirst({
      where: { projectId: id, name },
      select: { id: true },
    }),
    prisma.projectTag.count({ where: { projectId: id } }),
  ]);
  if (taken) return conflict(`This project already has a “${name}” tag`);
  if (count >= MAX_TAGS) {
    return badRequest(`A project keeps ${MAX_TAGS} tags at most`);
  }

  const tag = await prisma.projectTag.create({
    data: {
      projectId: id,
      name,
      // A colour that isn't a colour would end up in a style attribute.
      color: safeColor(body.color) ?? DEFAULT_TAG_COLOR,
    },
  });
  return NextResponse.json(tag, { status: 201 });
}
