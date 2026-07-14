import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const SPRINT_ID = "singleton";

export async function GET() {
  const sprint = await prisma.sprint.findUnique({ where: { id: SPRINT_ID } });
  return NextResponse.json(sprint);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  if (!body.startDate || !body.endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required" },
      { status: 400 }
    );
  }

  const sprint = await prisma.sprint.upsert({
    where: { id: SPRINT_ID },
    create: {
      id: SPRINT_ID,
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
