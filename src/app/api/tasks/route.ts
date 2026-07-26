import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");

  const tasks = await prisma.task.findMany({
    where: projectId ? { projectId } : undefined,
    include: { developer: true },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title || !body.startDate || !body.endDate || !body.projectId) {
    return NextResponse.json(
      { error: "projectId, title, startDate and endDate are required" },
      { status: 400 }
    );
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
