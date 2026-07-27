import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { parseDeveloper } from "@/lib/developer-input";
import { DEVELOPER_FIELDS } from "@/lib/developer-select";
import { NextRequest, NextResponse } from "next/server";

const notFound = () =>
  NextResponse.json({ error: "Developer not found" }, { status: 404 });

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/developers/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const owned = await prisma.developer.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!owned) return notFound();

  const parsed = parseDeveloper(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

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
  if (deleted.count === 0) return notFound();

  return NextResponse.json({ ok: true });
}
