import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const projectId = request.nextUrl.searchParams.get("projectId");

  const tasks = await prisma.task.findMany({
    // Scoping through the project relation keeps other users' tasks out even
    // when an arbitrary projectId is supplied.
    where: { project: { userId: user.id }, ...(projectId ? { projectId } : {}) },
    include: { developer: true },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title || !body.startDate || !body.endDate || !body.projectId) {
    return NextResponse.json(
      { error: "projectId, title, startDate and endDate are required" },
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

  // An assignee must come from the caller's own roster.
  if (body.developerId) {
    const developer = await prisma.developer.findFirst({
      where: { id: body.developerId, userId: user.id },
      select: { id: true },
    });
    if (!developer) {
      return NextResponse.json(
        { error: "Developer not found" },
        { status: 404 }
      );
    }
  }

  const maxOrder = await prisma.task.aggregate({
    where: { projectId: body.projectId },
    _max: { order: true },
  });

  const task = await prisma.task.create({
    data: {
      title,
      description: body.description?.trim() || null,
      link: body.link?.trim() || null,
      status: body.status || "TODO",
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      projectId: body.projectId,
      developerId: body.developerId || null,
      order: (maxOrder._max.order ?? 0) + 1,
    },
    include: { developer: true },
  });
  return NextResponse.json(task, { status: 201 });
}
