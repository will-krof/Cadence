import { prisma } from "@/lib/prisma";
import { requireUser, workspaceOwnerId } from "@/lib/api-auth";
import { requireViewer, teamEditProjectIds } from "@/lib/viewer";
import { parseDeveloper } from "@/lib/developer-input";
import { DEVELOPER_FIELDS } from "@/lib/developer-select";
import { ownedDeveloper } from "@/lib/owned";
import { badRequest, done, forbidden, notFound } from "@/lib/responses";
import { NextRequest, NextResponse } from "next/server";

/**
 * What somebody with the roster in an editing role may change about a colleague:
 * the working half of the card. What a person is paid, what an admin wrote in
 * their notes, and whether they are on the team at all stay with the workspace's
 * owner — a role that lets you keep the roster tidy isn't a role that lets you
 * read a salary or file somebody away.
 */
const TEAM_EDITABLE = [
  "name",
  "role",
  "email",
  "phone",
  "birthday",
  "workStatus",
  "color",
] as const;

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/developers/[id]">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  if (!(await ownedDeveloper(workspaceOwnerId(viewer), id))) {
    return notFound("Developer");
  }

  if (viewer.kind === "member") {
    // They have to share a project whose role opens the roster for editing…
    const projectIds = teamEditProjectIds(viewer);
    const shares =
      projectIds.length > 0 &&
      (await prisma.projectMember.findFirst({
        where: { developerId: id, projectId: { in: projectIds } },
        select: { id: true },
      })) != null;
    if (!shares) return forbidden();

    // …and only the working half of the card is theirs to write.
    for (const key of Object.keys(body)) {
      if (!(TEAM_EDITABLE as readonly string[]).includes(key)) {
        return forbidden("That part of a profile is the owner’s");
      }
    }
  }

  const parsed = parseDeveloper(body);
  if ("error" in parsed) return badRequest(parsed.error);

  // Archiving somebody takes them off the work as well as out of the roster:
  // an archived person is nobody to hand a task to, so they come off whatever
  // they were on rather than sitting there as a name nobody can pick. A task
  // they shared keeps everybody else.
  const archiving = parsed.data.active === false;

  const [developer] = await prisma.$transaction([
    prisma.developer.update({
      where: { id },
      data: parsed.data,
      select: DEVELOPER_FIELDS,
    }),
    ...(archiving
      ? [prisma.taskAssignee.deleteMany({ where: { developerId: id } })]
      : []),
  ]);
  return NextResponse.json(developer);
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/developers/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  const deleted = await prisma.developer.deleteMany({
    where: { id, userId: user.id },
  });
  if (deleted.count === 0) return notFound("Developer");

  return done();
}
