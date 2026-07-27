import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { NextRequest, NextResponse } from "next/server";

const notFound = () =>
  NextResponse.json({ error: "Sprint not found" }, { status: 404 });

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/sprints/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json();

  const sprint = await prisma.sprint.findFirst({
    where: { id, project: { userId: user.id } },
    select: { id: true, projectId: true, number: true },
  });
  if (!sprint) return notFound();

  const asked = Number(body.number);
  const number =
    body.number === undefined
      ? undefined
      : Number.isFinite(asked) && asked >= 1
        ? Math.floor(asked)
        : undefined;

  if (number !== undefined && number !== sprint.number) {
    const taken = await prisma.sprint.findFirst({
      where: { projectId: sprint.projectId, number },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json(
        { error: `Sprint ${number} already exists on this project` },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.sprint.update({
    where: { id },
    data: {
      number,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/sprints/[id]">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  // Tasks outlive the sprint they were planned into — they fall back to the
  // project's unplanned pile rather than being deleted with it.
  const deleted = await prisma.sprint.deleteMany({
    where: { id, project: { userId: user.id } },
  });
  if (deleted.count === 0) return notFound();

  return NextResponse.json({ ok: true });
}
