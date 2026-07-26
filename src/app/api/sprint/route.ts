import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const sprint = await prisma.sprint.findUnique({ where: { projectId } });
  return NextResponse.json(sprint);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  if (!body.projectId || !body.startDate || !body.endDate) {
    return NextResponse.json(
      { error: "projectId, startDate and endDate are required" },
      { status: 400 }
    );
  }

  const sprint = await prisma.sprint.upsert({
    where: { projectId: body.projectId },
    create: {
      projectId: body.projectId,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    },
    update: {
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
    },
  });
  return NextResponse.json(sprint);
}
