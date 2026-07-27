import { prisma } from "@/lib/prisma";
import { projectFilter, requireUser } from "@/lib/api-auth";
import { requireViewer } from "@/lib/viewer";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  if (viewer.kind === "guest" && projectId !== viewer.projectId) {
    return NextResponse.json(
      { error: "Your invite isn't for that project" },
      { status: 403 }
    );
  }

  const sprints = await prisma.sprint.findMany({
    where: { projectId, ...projectFilter(viewer) },
    orderBy: { number: "asc" },
  });
  return NextResponse.json(sprints);
}

export async function POST(request: NextRequest) {
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

  // Sprints are numbered in sequence unless the caller says otherwise.
  const highest = await prisma.sprint.aggregate({
    where: { projectId: body.projectId },
    _max: { number: true },
  });
  const asked = Number(body.number);
  const number =
    Number.isFinite(asked) && asked >= 1
      ? Math.floor(asked)
      : (highest._max.number ?? 0) + 1;

  const taken = await prisma.sprint.findFirst({
    where: { projectId: body.projectId, number },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json(
      { error: `Sprint ${number} already exists on this project` },
      { status: 409 }
    );
  }

  const sprint = await prisma.sprint.create({
    data: {
      projectId: body.projectId,
      number,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    },
  });
  return NextResponse.json(sprint, { status: 201 });
}
