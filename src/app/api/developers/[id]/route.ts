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

  const developer = await prisma.developer.update({
    where: { id },
    data: parsed.data,
    select: DEVELOPER_FIELDS,
  });
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
