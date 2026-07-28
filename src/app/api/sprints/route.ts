import { prisma } from "@/lib/prisma";
import { boardFilter, requireUser } from "@/lib/api-auth";
import { memberCannotRead, requireViewer } from "@/lib/viewer";
import { ownedProject } from "@/lib/owned";
import { badRequest, forbidden, notFound } from "@/lib/responses";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return badRequest("projectId is required");

  // Sprints are the boards' own dividing line, so seeing them takes a board:
  // being on a project with neither is being on it without a calendar.
  if (memberCannotRead(viewer, projectId)) return forbidden();

  const sprints = await prisma.sprint.findMany({
    where: { projectId, ...boardFilter(viewer) },
    orderBy: { number: "asc" },
  });
  return NextResponse.json(sprints);
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  if (!body.projectId || !body.startDate || !body.endDate) {
    return badRequest("projectId, startDate and endDate are required");
  }

  if (!(await ownedProject(user.id, body.projectId))) return notFound("Project");

  // Sprints are numbered in sequence unless the caller says otherwise.
  const highest = await prisma.sprint.aggregate({
    where: { projectId: body.projectId },
    _max: { number: true },
  });
  const asked = Number(body.number);
  const number =
    Number.isFinite(asked) && asked >= 1 && asked <= 10_000
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
