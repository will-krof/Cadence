import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { boundedText, LIMITS } from "@/lib/sanitize";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/roles">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const named = boundedText(body.name, LIMITS.roleName);
  if ("tooLong" in named) {
    return NextResponse.json(
      { error: `A role name is ${LIMITS.roleName} characters or fewer` },
      { status: 400 }
    );
  }
  const name = named.value;
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const owned = await prisma.project.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const taken = await prisma.projectRole.findFirst({
    where: { projectId: id, name },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json(
      { error: `This project already has a “${name}” role` },
      { status: 409 }
    );
  }

  // New roles start with nothing visible, so granting is always deliberate.
  const role = await prisma.projectRole.create({
    data: {
      projectId: id,
      name,
      canViewTimeline: body.canViewTimeline === true,
      canViewTracker: body.canViewTracker === true,
      canViewTeam: body.canViewTeam === true,
    },
  });
  return NextResponse.json(role, { status: 201 });
}
