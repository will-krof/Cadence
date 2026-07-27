import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { parseDeveloper } from "@/lib/developer-input";
import { DEVELOPER_FIELDS } from "@/lib/developer-select";
import { ownedDeveloper } from "@/lib/owned";
import { badRequest, done, notFound } from "@/lib/responses";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/developers/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  if (!(await ownedDeveloper(user.id, id))) return notFound("Developer");

  const parsed = parseDeveloper(body);
  if ("error" in parsed) return badRequest(parsed.error);

  // Archiving somebody takes them off the work as well as out of the roster:
  // an archived person is nobody to hand a task to, so what they were holding
  // goes back to unassigned rather than sitting with a name nobody can pick.
  const archiving = parsed.data.active === false;

  const [developer] = await prisma.$transaction([
    prisma.developer.update({
      where: { id },
      data: parsed.data,
      select: DEVELOPER_FIELDS,
    }),
    ...(archiving
      ? [
          prisma.task.updateMany({
            where: { developerId: id },
            data: { developerId: null },
          }),
        ]
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
