import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const sprint = await prisma.sprint.findFirst({
    where: { projectId, project: { userId: user.id } },
  });
  return NextResponse.json(sprint);
}

export async function PUT(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json();

  if (!body.projectId || !body.startDate || !body.endDate) {
    return NextResponse.json(
      { error: "projectId, startDate and endDate are required" },
      { status: 400 }
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId: user.id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Sprint numbers are counted by people, so they start at 1 and stay whole.
  const parsedNumber = Number(body.number);
  const number =
    Number.isFinite(parsedNumber) && parsedNumber >= 1
      ? Math.floor(parsedNumber)
      : undefined;

  const sprint = await prisma.sprint.upsert({
    where: { projectId: body.projectId },
    create: {
      projectId: body.projectId,
      number: number ?? 1,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    },
    update: {
      number,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    },
  });
  return NextResponse.json(sprint);
}
