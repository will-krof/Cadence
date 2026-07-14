import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/developers/[id]">
) {
  const { id } = await ctx.params;
  const body = await request.json();

  const developer = await prisma.developer.update({
    where: { id },
    data: {
      name: typeof body.name === "string" ? body.name.trim() : undefined,
      color: typeof body.color === "string" ? body.color : undefined,
    },
  });
  return NextResponse.json(developer);
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/developers/[id]">
) {
  const { id } = await ctx.params;
  await prisma.developer.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
